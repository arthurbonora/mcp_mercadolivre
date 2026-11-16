import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HandlerLifecycle } from '../dist/handler-lifecycle.js';
import { createHttpService } from '../dist/http-service.js';
const config={resource:'https://mcp.example.test/mcp',issuer:'https://auth.example.test',jwks:'https://auth.example.test/jwks',subject:'owner',client:'test',scope:'mcp:read',port:4611};
const auth=async()=>({token:'test-only',clientId:'test',scopes:['mcp:read']});
const message={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'wait',arguments:{}}};
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function factory(handler){return ()=>{const lifecycle=new HandlerLifecycle();const server=new McpServer({name:'isolated-double',version:'1'},{maxToolInputElements:2048});server.registerTool('wait',{inputSchema:{}},()=>lifecycle.run(handler));return Object.assign(server,{async drainAndClose(){lifecycle.stopAccepting();try{await server.close();}finally{await lifecycle.drain();}}});};}
function call(port,payload=message){let req;const promise=new Promise((resolve,reject)=>{req=request({hostname:'127.0.0.1',port,path:'/mcp',method:'POST',headers:{host:'mcp.example.test',authorization:'Bearer test-only','content-type':'application/json',accept:'application/json, text/event-stream'}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end(JSON.stringify(payload));});return {promise,disconnect:()=>req.destroy()};}
async function start(handler){const server=createHttpService(config,auth,factory(handler));server.listen(0,'127.0.0.1');await once(server,'listening');return {server,port:server.address().port};}
const ok={content:[{type:'text',text:'done'}]};
test('real HTTP + MCP: batch never reaches handler',async()=>{let calls=0;const {server,port}=await start(async()=>{calls++;return ok;});try{assert.equal((await call(port,[message,message]).promise).status,400);assert.equal(calls,0);assert.equal((await call(port).promise).status,200);assert.equal(calls,1);}finally{server.closeAllConnections();server.close();}});
test('pending handler keeps second HTTP request out',async()=>{const entered=deferred(),release=deferred();const {server,port}=await start(async()=>{entered.resolve();await release.promise;return ok;});try{const first=call(port);await entered.promise;assert.equal((await call(port).promise).status,429);release.resolve();assert.equal((await first.promise).status,200);}finally{release.resolve();server.closeAllConnections();server.close();}});
test('disconnect does not release lock until actual handler finishes',async()=>{const entered=deferred(),release=deferred();const {server,port}=await start(async()=>{entered.resolve();await release.promise;return ok;});try{const first=call(port);first.promise.catch(()=>{});await entered.promise;first.disconnect();await new Promise(r=>setTimeout(r,30));assert.equal((await call(port).promise).status,429);release.resolve();let result;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,10));result=await call(port).promise;if(result.status!==429)break;}assert.equal(result.status,200);}finally{release.resolve();server.closeAllConnections();server.close();}});
test('lifecycle rejects new work and drains rejected pending work',async()=>{const lifecycle=new HandlerLifecycle(), release=deferred();let drained=false;const pending=lifecycle.run(async()=>{await release.promise;throw Error('fixture');});pending.catch(()=>{});lifecycle.stopAccepting();const drain=lifecycle.drain().then(()=>drained=true);await assert.rejects(lifecycle.run(()=>ok));await new Promise(r=>setTimeout(r,10));assert.equal(drained,false);release.resolve();await drain;assert.equal(drained,true);});

async function assertWatchdog(mode) {
 const child=spawn(process.execPath,['tests/fixtures/http-watchdog.mjs',...(mode?[mode]:[])],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 // 'close' observes drained stdio, not just process termination.
 const [code,signal]=await once(child,'close');
 assert.equal(signal,null);
 assert.equal(code,70,`Unexpected exit; stdout=${stdout}; stderr=${stderr}`);
 assert.equal(stderr,'MCP_EXECUTION_DEADLINE\n');
 assert.equal(stdout,mode==='cleanup'?'HANDLER_ENTERED\nCLEANUP_ENTERED\n':'HANDLER_ENTERED\n');
}
test('watchdog proves handler entry and unique deadline exit',()=>assertWatchdog());
test('watchdog proves cleanup entry and unique deadline exit',()=>assertWatchdog('cleanup'));
test('supervisor double verifies each restarted worker reached its watchdog',async()=>{for(let attempt=0;attempt<2;attempt++) await assertWatchdog();});

test('watchdog harness rejects startup failure as false positive',async()=>{await assert.rejects(assertWatchdog('startup-failure'),{code:'ERR_ASSERTION'});});
