const fs = require("fs");
const logFile =
  "C:\\Users\\User\\.gemini\\antigravity-cli\\brain\\b16fea92-8659-44b0-a36d-f37f0e8cf923\\.system_generated\\tasks\\task-1496.log";
const content = fs.readFileSync(logFile, "utf8");

// The file might not be valid JSON, but a sequence of JSON objects.
// We can use a regex to extract the "logs" arrays or "exceptions".
const matches = content.matchAll(/"logs":\s*(\[.*?\])/gs);
for (const match of matches) {
  try {
    const logs = JSON.parse(match[1]);
    if (logs.length > 0) {
      logs.forEach((l) => {
        if (
          l.level === "error" ||
          l.message.some(
            (m) =>
              typeof m === "string" &&
              (m.includes("Error") || m.includes("Exception") || m.includes("441")),
          )
        ) {
          console.log(l);
        }
      });
    }
  } catch (e) {}
}

const exMatches = content.matchAll(/"exceptions":\s*(\[.*?\])/gs);
for (const match of exMatches) {
  try {
    const ex = JSON.parse(match[1]);
    if (ex.length > 0) console.log("EXCEPTION:", ex);
  } catch (e) {}
}
