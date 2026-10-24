require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(process.env.DB_PATH || 'naomi.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rates (service TEXT PRIMARY KEY, base REAL NOT NULL, per_km REAL NOT NULL, minimum REAL NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
 service TEXT NOT NULL, vehicle TEXT NOT NULL, pickup TEXT NOT NULL, destination TEXT NOT NULL,
 date TEXT NOT NULL, time TEXT NOT NULL, passengers INTEGER NOT NULL, distance REAL DEFAULT 0,
 notes TEXT DEFAULT '', estimate REAL NOT NULL, fare REAL, status TEXT NOT NULL DEFAULT 'Pending',
 created_at TEXT NOT NULL, completed_at TEXT, email_sent_at TEXT
);
`);
const defaultRates = [
 ['Airport pickup/drop',700,18,700], ['Local Pune',500,16,500],
 ['Outstation',0,17,1500], ['Full-day rental',2500,0,2500],
 ['Corporate booking',800,18,800]
];
const rateInsert = db.prepare('INSERT OR IGNORE INTO rates(service,base,per_km,minimum) VALUES(?,?,?,?)');
defaultRates.forEach(r=>rateInsert.run(...r));

function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD in .env before running this app.');
    process.exit(1);
  }
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!existing) {
    db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(username,bcrypt.hashSync(password,12));
    console.log('Admin user created from environment settings.');
  }
}
ensureAdmin();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:'100kb'}));
app.use(express.urlencoded({extended:false,limit:'100kb'}));
app.use(session({
  name:'naomi.sid',
  secret:process.env.SESSION_SECRET || 'replace-this-before-deployment-with-a-long-random-secret',
  resave:false, saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,'public')));
const loginLimiter = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false});
const bookingLimiter = rateLimit({windowMs:60*60*1000,limit:20,standardHeaders:true,legacyHeaders:false});
const admin = (req,res,next)=> req.session && req.session.admin ? next() : res.status(401).json({error:'Please log in as owner.'});

function getRates(){ return db.prepare('SELECT * FROM rates ORDER BY service').all(); }
function estimate(service, distance) {
  const r=db.prepare('SELECT * FROM rates WHERE service=?').get(service);
  if(!r) throw new Error('Invalid service');
  if(service==='Full-day rental') return Number(r.base);
  return Math.max(Number(r.minimum),Number(r.base)+(Number(distance)||0)*Number(r.per_km));
}
function emailTransport() {
  if(!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
    secure:String(process.env.SMTP_SECURE||'false')==='true',
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
}
function invoicePdf(b) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:52});
    const chunks=[]; doc.on('data',c=>chunks.push(c)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject);
    doc.fontSize(22).fillColor('#14263d').text('Naomi Tours and Travels');
    doc.moveDown(0.3).fontSize(11).fillColor('#536176').text('Pune, Maharashtra');
    doc.moveDown().strokeColor('#d7deea').moveTo(52,doc.y).lineTo(543,doc.y).stroke();
    doc.moveDown().fontSize(18).fillColor('#182436').text('Trip Invoice / Receipt');
    doc.moveDown(0.5).fontSize(11).fillColor('#182436');
    const lines=[
      ['Invoice / Booking ID',b.id],['Customer',b.name],['Mobile',b.phone],['Email',b.email],
      ['Service',b.service],['Vehicle',b.vehicle],['Pickup',b.pickup],['Destination',b.destination],
      ['Trip date',b.date],['Pickup time',b.time],['Passengers',String(b.passengers)],
      ['Distance (km)',String(b.distance||0)],['Booking status',b.status]
    ];
    lines.forEach(([k,v])=>{doc.font('Helvetica-Bold').text(k+': ',{continued:true});doc.font('Helvetica').text(String(v||'-'));});
    doc.moveDown().strokeColor('#d7deea').moveTo(52,doc.y).lineTo(543,doc.y).stroke();doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#2357d5').text('Total fare: Rs. '+Number(b.fare ?? b.estimate).toLocaleString('en-IN'));
    doc.moveDown().font('Helvetica').fontSize(9).fillColor('#65758b').text('This receipt is generated by Naomi Tours and Travels. No GST or signature is included. Please retain this receipt for your records.');
    doc.end();
  });
}
async function sendInvoice(b) {
  const transporter=emailTransport();
  if(!transporter) throw new Error('Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and related settings in .env.');
  const pdf=await invoicePdf(b);
  await transporter.sendMail({
    from:process.env.MAIL_FROM || process.env.SMTP_USER,
    to:b.email,
    subject:`Naomi Tours and Travels — Invoice ${b.id}`,
    text:`Hello ${b.name},\n\nThank you for travelling with Naomi Tours and Travels. Please find your invoice attached.\n\nBooking ID: ${b.id}\nTrip: ${b.pickup} to ${b.destination}\nDate: ${b.date}\nFare: Rs. ${Number(b.fare ?? b.estimate).toLocaleString('en-IN')}\n\nRegards,\nNaomi Tours and Travels`,
    attachments:[{filename:`Naomi-Invoice-${b.id}.pdf`,content:pdf,contentType:'application/pdf'}]
  });
  db.prepare('UPDATE bookings SET email_sent_at=? WHERE id=?').run(new Date().toISOString(),b.id);
}

app.get('/api/public/config',(req,res)=>res.json({services:getRates().map(r=>r.service),contact:process.env.PUBLIC_CONTACT||'7972899919'}));
app.get('/api/public/rates',(req,res)=>res.json(getRates().map(r=>({service:r.service,base:r.base,per_km:r.per_km,minimum:r.minimum}))));
app.post('/api/bookings',bookingLimiter,(req,res)=>{
  const x=req.body||{};
  const required=['name','phone','email','service','pickup','destination','date','time'];
  if(required.some(k=>!String(x[k]||'').trim())) return res.status(400).json({error:'Please complete all required fields.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) return res.status(400).json({error:'Enter a valid email address.'});
  if(!/^[0-9 +()-]{10,16}$/.test(x.phone)) return res.status(400).json({error:'Enter a valid mobile number.'});
  const distance=Math.max(0,Number(x.distance)||0);
  let fare; try{fare=estimate(x.service,distance)}catch(e){return res.status(400).json({error:e.message})}
  const id='NT-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
  db.prepare(`INSERT INTO bookings(id,name,phone,email,service,vehicle,pickup,destination,date,time,passengers,distance,notes,estimate,status,created_at)
  VALUES(@id,@name,@phone,@email,@service,@vehicle,@pickup,@destination,@date,@time,@passengers,@distance,@notes,@estimate,'Pending',@created_at)`).run({
    id,name:String(x.name).trim().slice(0,120),phone:String(x.phone).trim(),email:String(x.email).trim(),
    service:x.service,vehicle:String(x.vehicle||'Ertiga').slice(0,80),pickup:String(x.pickup).trim().slice(0,250),
    destination:String(x.destination).trim().slice(0,250),date:String(x.date),time:String(x.time),
    passengers:Math.max(1,Math.min(20,Number(x.passengers)||1)),distance,notes:String(x.notes||'').slice(0,1000),
    estimate:fare,created_at:new Date().toISOString()
  });
  res.status(201).json({id,estimate:fare,message:'Request received. The owner will confirm availability and final fare.'});
});

app.post('/api/admin/login',loginLimiter,(req,res)=>{
  const {username,password}=req.body||{};
  const u=db.prepare('SELECT * FROM users WHERE username=?').get(String(username||''));
  if(!u || !bcrypt.compareSync(String(password||''),u.password_hash)) return res.status(401).json({error:'Incorrect username or password.'});
  req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Could not create session.'});req.session.admin={id:u.id,username:u.username};res.json({ok:true,username:u.username});});
});
app.post('/api/admin/logout',admin,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/admin/me',(req,res)=>res.json({loggedIn:!!(req.session&&req.session.admin),username:req.session?.admin?.username||null}));
app.get('/api/admin/bookings',admin,(req,res)=>res.json(db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all()));
app.get('/api/admin/rates',admin,(req,res)=>res.json(getRates()));
app.put('/api/admin/rates',admin,(req,res)=>{
  const list=req.body?.rates;if(!Array.isArray(list))return res.status(400).json({error:'Rates array required'});
  const upd=db.prepare('UPDATE rates SET base=?,per_km=?,minimum=? WHERE service=?');
  const tx=db.transaction(()=>list.forEach(r=>{
    for(const k of ['base','per_km','minimum']) if(!Number.isFinite(Number(r[k]))||Number(r[k])<0) throw new Error('Rates must be non-negative numbers.');
    upd.run(Number(r.base),Number(r.per_km),Number(r.minimum),String(r.service));
  }));
  try{tx();res.json({ok:true,rates:getRates()})}catch(e){res.status(400).json({error:e.message})}
});
app.patch('/api/admin/bookings/:id',admin,async(req,res)=>{
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);if(!b)return res.status(404).json({error:'Booking not found.'});
  const status=req.body?.status||b.status;
  if(!['Pending','Confirmed','Rejected','Completed'].includes(status))return res.status(400).json({error:'Invalid status.'});
  let fare=req.body?.fare===undefined?b.fare:Number(req.body.fare);
  if(fare!==null&&(!Number.isFinite(Number(fare))||Number(fare)<0))return res.status(400).json({error:'Invalid fare.'});
  if(status==='Confirmed'&&fare===null)fare=b.estimate;
  db.prepare('UPDATE bookings SET status=?,fare=? WHERE id=?').run(status,fare,req.params.id);
  let emailMessage=null;
  if(status==='Completed'&&b.status!=='Completed'){
    const fresh=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
    try{await sendInvoice(fresh);emailMessage='Invoice emailed to customer.';}
    catch(e){emailMessage='Trip marked completed, but invoice email was not sent: '+e.message;}
  }
  res.json({ok:true,booking:db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id),emailMessage});
});
app.get('/api/admin/bookings.csv',admin,(req,res)=>{
  const rows=db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  const cols=Object.keys(rows[0]||{id:'',name:'',phone:'',email:'',service:'',pickup:'',destination:'',date:'',time:'',estimate:'',fare:'',status:''});
  const csv=[cols.join(','),...rows.map(r=>cols.map(c=>'"'+String(r[c]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Naomi_Tours_Bookings.csv"');res.send('\ufeff'+csv);
});
app.get('/api/admin/invoice/:id.pdf',admin,async(req,res)=>{
  const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);if(!b)return res.status(404).send('Booking not found');
  const pdf=await invoicePdf(b);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="Naomi-Invoice-${b.id}.pdf"`);res.send(pdf);
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Naomi Tours app listening on port ${PORT}`));
