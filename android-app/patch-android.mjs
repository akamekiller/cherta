// Правки проекта android/ после «npx cap add android»: иконки, версия, подпись, разрешения.
import { cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "android", "app");
const version = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version;
const code = Number(process.env.GITHUB_RUN_NUMBER || 1);

// иконки (static/icons → android-app/res, сделаны один раз скриптом на Python)
cpSync(join(here, "res"), join(app, "src", "main", "res"), { recursive: true });

// версия и подпись
const gradle = join(app, "build.gradle");
let g = readFileSync(gradle, "utf8");
g = g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${version}"`);
g += `
android {
    signingConfigs {
        release {
            storeFile file("../../cherta.keystore")
            storePassword "cherta-android"
            keyAlias "cherta"
            keyPassword "cherta-android"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
`;
writeFileSync(gradle, g);

// микрофон — «Тоны → Произношение»
const manifest = join(app, "src", "main", "AndroidManifest.xml");
let m = readFileSync(manifest, "utf8");
for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"]) {
  if (!m.includes(perm)) m = m.replace("</manifest>", `    <uses-permission android:name="${perm}" />\n</manifest>`);
}
writeFileSync(manifest, m);
console.log(`android: версия ${version} (${code})${existsSync(join(app, "src", "main", "res", "mipmap-xxxhdpi", "ic_launcher.png")) ? ", иконки на месте" : ""}`);
