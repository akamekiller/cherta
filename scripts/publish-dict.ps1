# Публикация словаря в отдельный репозиторий cherta-dict (GitHub Pages).
# Каждый раз отправляется один коммит с заменой истории: старые версии словаря не копятся.
#
# Один раз: создать на GitHub пустой репозиторий cherta-dict, после первой публикации
# включить Settings → Pages → Branch: main, папка / (root).
#
# Запуск из папки проекта:
#   python scripts\build_dict.py
#   powershell -ExecutionPolicy Bypass -File scripts\publish-dict.ps1

param([string]$Repo = "https://github.com/akamekiller/cherta-dict.git")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path $PSScriptRoot -Parent
$dict = Join-Path $root "dict"
if (-not (Test-Path (Join-Path $dict "meta.json"))) { throw "Нет dict\meta.json. Сначала соберите словарь: python scripts\build_dict.py" }
$meta = Get-Content (Join-Path $dict "meta.json") -Raw | ConvertFrom-Json

$tmp = Join-Path $env:TEMP "cherta-dict-publish"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item (Join-Path $dict "*") $tmp
New-Item -ItemType File (Join-Path $tmp ".nojekyll") | Out-Null
@"
# Данные словаря для «Черты»

Собрано из базы 大БКРС (bkrs.info) скриптом scripts/build_dict.py проекта github.com/akamekiller/cherta.
Версия $($meta.v), статей: $($meta.count).
"@ | Set-Content (Join-Path $tmp "README.md") -Encoding UTF8

# имя и почта для коммита — как в основном проекте (там они могут быть заданы только для этой папки)
$name = git -C $root config user.name
$email = git -C $root config user.email
if (-not $name) { $name = "akamekiller" }
if (-not $email) { $email = "akamekiller@users.noreply.github.com" }

Push-Location $tmp
try {
  git init -q -b main
  git config user.name $name
  git config user.email $email
  git config core.autocrlf false
  git add -A
  git commit -q -m "Словарь, версия $($meta.v)"
  if ($LASTEXITCODE -ne 0) { throw "git commit не удался" }
  git push -f $Repo main
  if ($LASTEXITCODE -ne 0) { throw "git push не удался" }
} finally {
  Pop-Location
  Remove-Item $tmp -Recurse -Force
}
Write-Host "Готово: словарь версии $($meta.v) отправлен в $Repo"
