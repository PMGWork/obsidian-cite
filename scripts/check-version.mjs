import { readFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const [manifest, packageJson, versions] = await Promise.all([
  readJson("manifest.json"),
  readJson("package.json"),
  readJson("versions.json"),
]);
const releaseTag = process.argv[2];
const errors = [];

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  errors.push(`manifest version must be x.y.z, received ${manifest.version}`);
}
if (manifest.version !== packageJson.version) {
  errors.push(`manifest (${manifest.version}) and package (${packageJson.version}) versions differ`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  errors.push(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}`);
}
if (releaseTag && releaseTag !== manifest.version) {
  errors.push(`release tag ${releaseTag} must equal manifest version ${manifest.version}`);
}
if (releaseTag?.startsWith("v")) errors.push("release tags must not use a v prefix");

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`Version error: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Version metadata is consistent (${manifest.version}).\n`);
}
