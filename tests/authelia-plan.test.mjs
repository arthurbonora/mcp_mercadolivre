import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('deployment/authelia-candidate/plan.json','utf8'));
const template=fs.readFileSync('deployment/authelia-candidate/oidc-fragment.yaml.template','utf8');
test('design stays unprovisioned and isolated',()=>{assert.equal(p.deployable,false);assert.equal(p.issuer,null);assert.deepEqual(p.subjectAllowlist,[]);assert.deepEqual(p.callbackAllowlist,[]);assert.equal(p.reuseLinkedInSecrets,false);assert.match(template,/REPLACE_EXACT_URI/);});
test('design does not fall back to DCR or weaker grants',()=>{assert.equal(p.dcr,false);assert.equal(p.pkceRequired,true);assert.equal(p.pkceMethod,'S256');assert.deepEqual(p.grantTypes,['authorization_code','refresh_token']);assert.equal(p.readOnly,true);assert.equal(p.expectedJwtType,'at+jwt');assert.equal(p.accessTokenLifetimeSeconds,300);assert.equal(p.publicApplicationListener,false);});
