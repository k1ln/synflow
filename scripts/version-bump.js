const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const [major, minor, patch] = pkg.version.split('.').map(Number);

let newMajor = major;
let newMinor = minor;
let newPatch = patch + 1;

if (newPatch >= 10) {
  newMinor += 1;
  newPatch = 0;
}

pkg.version = `${newMajor}.${newMinor}.${newPatch}`;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Version bumped to ${pkg.version}`);
