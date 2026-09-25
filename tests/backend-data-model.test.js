const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: __dirname + '/..',
  env: { ...process.env, PORT: '9100' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProc.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
serverProc.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (serverOutput.includes('http://localhost:9100')) return;
  }
  throw new Error(`Server did not start. Output: ${serverOutput}`);
}

(async () => {
  try {
    await waitForServer();

    const departmentsResponse = await fetch('http://localhost:9100/api/departments');
    const departmentsBody = await departmentsResponse.json();
    console.log('departments status:', departmentsResponse.status, departmentsBody);
    assert.equal(departmentsResponse.status, 200, 'Departments endpoint should exist');
    assert.ok(Array.isArray(departmentsBody.departments), 'Departments response should include an array');
    assert.ok(departmentsBody.departments.length > 0, 'Departments list should not be empty');

    const servicesResponse = await fetch('http://localhost:9100/api/services');
    const servicesBody = await servicesResponse.json();
    console.log('services status:', servicesResponse.status, servicesBody);
    assert.equal(servicesResponse.status, 200, 'Services endpoint should exist');
    assert.ok(Array.isArray(servicesBody.services), 'Services response should include an array');
    assert.ok(servicesBody.services.length > 0, 'Services list should not be empty');

    console.log('BACKEND DATA MODEL TEST: PASS');
  } catch (error) {
    console.error('BACKEND DATA MODEL TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();
