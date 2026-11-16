import { request } from 'node:http';
import { writeSync } from 'node:fs';
import { once } from 'node:events';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpService } from '../../dist/http-service.js';
import { HandlerLifecycle } from '../../dist/handler-lifecycle.js';
if (process.argv[2] === 'startup-failure') process.exit(1);
const config={resource:'https://mcp.example.test/mcp',issuer:'https://auth.example.test',jwks:'https://auth.example.test/jwks',subject:'owner',client:'test',scope:'mcp:read',port:4611};
const http=createHttpService(config,async()=>({token:'fixture',clientId:'test',scopes:['mcp:read']}),()=>{const lifecycle=new HandlerLifecycle();const s=new McpServer({name:'fixture',version:'1'});s.registerTool('hang',{inputSchema:{}},()=>lifecycle.run(()=>{writeSync(1,"HANDLER_ENTERED\n");return process.argv[2] === "cleanup" ? {content:[{type:"text",text:"done"}]} : new Promise(()=>{});}));return Object.assign(s,{async drainAndClose(){lifecycle.stopAccepting();await s.close();await lifecycle.drain();if(process.argv[2] === "cleanup") {writeSync(1,"CLEANUP_ENTERED\n");await new Promise(()=>{});}}});},{deadlineMs:150});
http.listen(0,'127.0.0.1');await once(http,'listening');
const req=request({hostname:'127.0.0.1',port:http.address().port,path:'/mcp',method:'POST',headers:{host:'mcp.example.test',authorization:'Bearer fixture','content-type':'application/json',accept:'application/json, text/event-stream'}},()=>{});req.on('error',()=>{});req.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hang',arguments:{}}}));
// A failing watchdog exits with 9, not a successful-test exit70.
setTimeout(()=>process.exit(9),2000);
