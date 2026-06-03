// serverList.js — zombs.io live server map.
//
// Lifted from client-side serverArr in Banshee. If the upstream IPs
// rotate this file is the single place to update.

const serverArr = [
  ["v1001", "US East #1", "45.76.4.28", "zombs-2d4c041c-0.eggs.gg"],
  ["v1002", "US East #2", "45.77.203.204", "zombs-2d4dcbcc-0.eggs.gg"],
  ["v1003", "US East #3", "45.77.200.150", "zombs-2d4dc896-0.eggs.gg"],
  ["v1004", "US East #4", "104.156.225.133", "zombs-689ce185-0.eggs.gg"],
  ["v1005", "US East #5", "45.77.149.224", "zombs-2d4d95e0-0.eggs.gg"],
  ["v1006", "US East #6", "173.199.123.77", "zombs-adc77b4d-0.eggs.gg"],
  ["v1007", "US East #7", "45.76.166.32", "zombs-2d4ca620-0.eggs.gg"],
  ["v1008", "US East #8", "149.28.58.193", "zombs-951c3ac1-0.eggs.gg"],
  ["v2001", "US West #1", "149.28.87.132", "zombs-951c5784-0.eggs.gg"],
  ["v2002", "US West #2", "45.76.68.210", "zombs-2d4c44d2-0.eggs.gg"],
  ["v2003", "US West #3", "108.61.219.244", "zombs-6c3ddbf4-0.eggs.gg"],
  ["v5001", "Europe #1", "80.240.19.5", "zombs-50f01305-0.eggs.gg"],
  ["v5002", "Europe #2", "45.77.53.65", "zombs-2d4d3541-0.eggs.gg"],
  ["v5003", "Europe #3", "95.179.167.12", "zombs-5fb3a70c-0.eggs.gg"],
  ["v5004", "Europe #4", "95.179.163.97", "zombs-5fb3a361-0.eggs.gg"],
  ["v5005", "Europe #5", "136.244.83.44", "zombs-88f4532c-0.eggs.gg"],
  ["v5006", "Europe #6", "45.32.158.210", "zombs-2d209ed2-0.eggs.gg"],
  ["v5007", "Europe #7", "95.179.169.17", "zombs-5fb3a911-0.eggs.gg"],
  ["v3001", "Asia #1", "45.77.249.75", "zombs-2d4df94b-0.eggs.gg"],
  ["v4001", "Australia #1", "149.28.182.161", "zombs-951cb6a1-0.eggs.gg"],
  ["v4002", "Australia #2", "149.28.165.199", "zombs-951ca5c7-0.eggs.gg"],
].map(([id, name, hostname, host]) => ({
  id, name,
  region: name.split(" #")[0],
  hostname, host, port: 443, fallbackPort: 443,
}));

const serverMap = new Map(serverArr.map((s) => [s.id, s]));

module.exports = { serverArr, serverMap };
