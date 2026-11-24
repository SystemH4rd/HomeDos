#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
sdk_dir="${HOMEDOS_ANDROID_SDK:-/tmp/homedos-android-sdk}"
tools_dir="$sdk_dir/android-15"
platform_jar="$sdk_dir/android-35/android.jar"
build_dir="$repo_dir/android/build"
signing_dir="${HOMEDOS_SIGNING_DIR:-/workspace/homedos-signing}"
output_dir="${HOMEDOS_APK_OUTPUT:-/workspace/output}"
mkdir -p "$build_dir/classes" "$build_dir/dex" "$output_dir" "$signing_dir"
chmod 700 "$signing_dir"
for needed in "$platform_jar" "$sdk_dir/ecj-3.39.0.jar" "$tools_dir/aapt2" "$tools_dir/d8" "$tools_dir/apksigner"; do test -f "$needed" || { echo "Missing Android build dependency: $needed" >&2; exit 1; }; done
chmod +x "$tools_dir/aapt2" "$tools_dir/d8" "$tools_dir/apksigner" "$tools_dir/zipalign"
if [ ! -f "$signing_dir/homedos-release.jks" ]; then
 python3 - "$signing_dir/password.txt" <<'PY'
import os,secrets,sys
os.umask(0o077)
with open(sys.argv[1],'w') as f:f.write(secrets.token_urlsafe(36))
PY
 keytool -genkeypair -keystore "$signing_dir/homedos-release.jks" -storetype PKCS12 -alias homedos -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=HomeDos Android, O=HomeDos, C=UA" -storepass:file "$signing_dir/password.txt" -keypass:file "$signing_dir/password.txt"
fi
"$tools_dir/aapt2" compile --dir "$repo_dir/android/res" -o "$build_dir/resources.zip"
"$tools_dir/aapt2" link -I "$platform_jar" --manifest "$repo_dir/android/AndroidManifest.xml" -o "$build_dir/unsigned.apk" "$build_dir/resources.zip"
java -jar "$sdk_dir/ecj-3.39.0.jar" -source 1.8 -target 1.8 -bootclasspath "$platform_jar" -d "$build_dir/classes" "$repo_dir/android/src/ua/homedos/app/MainActivity.java"
mapfile -t class_files < <(find "$build_dir/classes" -name '*.class' -type f)
"$tools_dir/d8" --min-api 26 --lib "$platform_jar" --output "$build_dir/dex" "${class_files[@]}"
python3 - "$build_dir/unsigned.apk" "$build_dir/dex/classes.dex" <<'PY'
import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'a') as z:z.write(sys.argv[2],'classes.dex')
PY
"$tools_dir/zipalign" -f -p 4 "$build_dir/unsigned.apk" "$build_dir/aligned.apk"
"$tools_dir/apksigner" sign --ks "$signing_dir/homedos-release.jks" --ks-key-alias homedos --ks-pass "file:$signing_dir/password.txt" --out "$output_dir/HomeDos-1.0.0.apk" "$build_dir/aligned.apk"
"$tools_dir/apksigner" verify --verbose --print-certs "$output_dir/HomeDos-1.0.0.apk"
sha256sum "$output_dir/HomeDos-1.0.0.apk" > "$output_dir/HomeDos-1.0.0.apk.sha256"
echo "APK: $output_dir/HomeDos-1.0.0.apk"
