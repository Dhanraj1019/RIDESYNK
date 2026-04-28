const fs = require('fs');
const filePath = process.argv[2] || __dirname + '/public/js/map_page.js';

let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the member distance block
const oldBlock = [
  "    if (loc) {",
  "      distanceM = haversine(loc.lat, loc.lng, srcLat, srcLng);",
  "      if (distanceM < 80) {",
  "        distanceText = '\\u2705 Reached source';",
  "        status = 'reached';",
  "      } else if (distanceM < 1000) {",
  "        distanceText = `${Math.round(distanceM)} m from source`;",
  "        status = 'onway';",
  "      } else {",
  "        distanceText = `${(distanceM / 1000).toFixed(1)} km from source`;",
  "        status = 'onway';",
  "      }",
  "    }"
].join("\r\n");

const newBlock = [
  "    if (loc) {",
  "      const distToSrc = haversine(loc.lat, loc.lng, srcLat, srcLng);",
  "      const hasReached = distToSrc < 80 || reachedSourceUsers.has(uid);",
  "",
  "      if (hasReached || rideStarted) {",
  "        // After reaching source OR ride started -> show distance to destination",
  "        const distToDst = haversine(loc.lat, loc.lng, dstLat, dstLng);",
  "        distanceM = distToDst;",
  "        status = hasReached ? 'reached' : 'onway';",
  "",
  "        if (distToDst < 100) {",
  "          distanceText = '\\ud83c\\udfc1 Near destination';",
  "        } else if (distToDst < 1000) {",
  "          distanceText = `${Math.round(distToDst)} m to destination`;",
  "        } else {",
  "          distanceText = `${(distToDst / 1000).toFixed(1)} km to destination`;",
  "        }",
  "        console.log('DISTANCE SWITCHED TO DESTINATION', uid);",
  "      } else {",
  "        // Before reaching source -> show distance to source",
  "        distanceM = distToSrc;",
  "        status = 'onway';",
  "        if (distToSrc < 1000) {",
  "          distanceText = `${Math.round(distToSrc)} m from source`;",
  "        } else {",
  "          distanceText = `${(distToSrc / 1000).toFixed(1)} km from source`;",
  "        }",
  "      }",
  "    }"
].join("\r\n");

const found = content.includes(oldBlock);
console.log('Old block found:', found);

if (found) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Replacement done successfully!');
} else {
  // Debug: try to find partial matches
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('distanceM = haversine(loc.lat')) {
      console.log(`Found partial at line ${i+1}: ${JSON.stringify(lines[i])}`);
    }
  }
}
