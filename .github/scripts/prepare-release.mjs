import fs from "node:fs";
import path from "node:path";

const tag = process.env.RELEASE_TAG;

if (!tag) {
  throw new Error("RELEASE_TAG is required");
}

const match = tag.match(/^(.+)@([^@]+)$/);

if (!match) {
  throw new Error(`Unsupported tag format: ${tag}`);
}

const [, packageName, version] = match;
const packagesDir = path.resolve("packages");
const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name));

const packageDir = packageDirs.find((dir) => {
  const packageJsonPath = path.join(dir, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.name === packageName;
});

if (!packageDir) {
  throw new Error(`Unable to find package for tag ${tag}`);
}

const changelogPath = path.join(packageDir, "CHANGELOG.md");

if (!fs.existsSync(changelogPath)) {
  throw new Error(`Missing changelog for ${packageName}: ${changelogPath}`);
}

const changelog = fs.readFileSync(changelogPath, "utf8");
const lines = changelog.split(/\r?\n/);
const heading = `## ${version}`;
const startIndex = lines.findIndex((line) => line.trim() === heading);

if (startIndex === -1) {
  throw new Error(`Unable to find changelog section for ${packageName}@${version}`);
}

let endIndex = lines.length;

for (let index = startIndex + 1; index < lines.length; index += 1) {
  if (lines[index].startsWith("## ")) {
    endIndex = index;
    break;
  }
}

const sectionBody = lines.slice(startIndex + 1, endIndex).join("\n").trim();

if (!sectionBody) {
  throw new Error(`Changelog section is empty for ${packageName}@${version}`);
}

const releaseName = `${packageName}@${version}`;
const releaseBody = `# ${releaseName}\n\n${sectionBody}`;
const outputPath = process.env.GITHUB_OUTPUT;

if (!outputPath) {
  throw new Error("GITHUB_OUTPUT is required");
}

fs.appendFileSync(outputPath, `release_name=${releaseName}\n`);
fs.appendFileSync(outputPath, `release_body<<EOF\n${releaseBody}\nEOF\n`);
