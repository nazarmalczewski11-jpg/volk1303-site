const https = require('https');

https.get('https://volk1303-site.vercel.app/app.js', (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('CONTAINS CLOUD_BUCKET in handleRegisterSubmit:', data.includes('fetch(CLOUD_BUCKET'));
  });
}).on('error', (err) => {
  console.error('Error:', err);
});
