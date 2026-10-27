import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const assets=new Map([['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.mjs','app.mjs'],['/model.mjs','model.mjs'],['/review.mjs','review.mjs']]);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host??'')){res.writeHead(403);res.end('Local only');return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  const filename=assets.get(new URL(req.url,'http://localhost').pathname);
  if(!filename){res.writeHead(404);res.end('Not found');return;}
  try{const content=await fs.readFile(path.join(root,filename));res.writeHead(200,{'Content-Type':types[path.extname(filename)]});res.end(req.method==='HEAD'?undefined:content);}
  catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',(error)=>{console.error(error.message);process.exitCode=1;});
server.listen(4180,'127.0.0.1',()=>console.log('MCP wireframes: http://127.0.0.1:4180 · simulation only'));
process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
