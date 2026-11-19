import http from 'http';

function requestApi(endpoint: string, method: string = 'GET', token?: string, bodyData?: any) {
  return new Promise((resolve, reject) => {
    const payload = bodyData ? JSON.stringify(bodyData) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (payload) {
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request(
      `http://localhost:5173${endpoint}`,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTest() {
  console.log('=== FULL ROLE AUTHORIZATION TEST ===');

  const accounts = [
    { name: 'Admin', email: 'admin@factorypulse.demo', role: 'ADMIN', expectedPath: '/admin/dashboard' },
    { name: 'Manager', email: 'manager@factorypulse.demo', role: 'MANAGER', expectedPath: '/manager/dashboard' },
    { name: 'Worker', email: 'worker@factorypulse.demo', role: 'WORKER', expectedPath: '/worker/dashboard' },
    { name: 'Technician', email: 'technician@factorypulse.demo', role: 'TECHNICIAN', expectedPath: '/technician/dashboard' },
  ];

  for (const acc of accounts) {
    const loginRes = (await requestApi('/api/auth/login', 'POST', undefined, {
      email: acc.email,
      password: 'DemoPulse!2026',
    })) as any;

    if (loginRes.status !== 200 || !loginRes.data.token) {
      console.error(`FAIL: Login failed for ${acc.name}: Status ${loginRes.status}`);
      continue;
    }

    const token = loginRes.data.token;
    console.log(`\n[${acc.name} Login] Token received -> RedirectTo: ${loginRes.data.redirectTo} (Role: ${loginRes.data.user.role})`);

    // Verify /api/auth/me
    const meRes = (await requestApi('/api/auth/me', 'GET', token)) as any;
    console.log(`  -> /api/auth/me: User=${meRes.data.user?.email}, Role=${meRes.data.user?.role}`);

    // Test Admin endpoint (/api/admin/overview)
    const adminRes = (await requestApi('/api/admin/overview', 'GET', token)) as any;
    console.log(`  -> Access /api/admin/overview: Status ${adminRes.status} (${adminRes.status === 200 ? 'ALLOWED' : 'DENIED'})`);

    // Test Manager endpoint (/api/analytics/overview)
    const managerRes = (await requestApi('/api/analytics/overview', 'GET', token)) as any;
    console.log(`  -> Access /api/analytics/overview: Status ${managerRes.status} (${managerRes.status === 200 ? 'ALLOWED' : 'DENIED'})`);

    // Test Worker endpoint (/api/worker/me)
    const workerRes = (await requestApi('/api/worker/me', 'GET', token)) as any;
    console.log(`  -> Access /api/worker/me: Status ${workerRes.status} (${workerRes.status === 200 ? 'ALLOWED' : 'DENIED'})`);

    // Test Maintenance endpoint (/api/maintenance/requests)
    const maintRes = (await requestApi('/api/maintenance/requests', 'GET', token)) as any;
    console.log(`  -> Access /api/maintenance/requests: Status ${maintRes.status} (${maintRes.status === 200 ? 'ALLOWED' : 'DENIED'})`);
  }
}

runTest().catch(console.error);
