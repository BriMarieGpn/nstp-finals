$root = "C:\Users\Brad\OneDrive\Pictures\LandingPageUXToolInfo (1)"
$pages = Get-ChildItem -Path $root -Recurse -Filter *.html -File

$missing = New-Object System.Collections.Generic.List[object]
$stylesheetIssues = New-Object System.Collections.Generic.List[object]

function Resolve-RefPath([string]$pageFullPath, [string]$refRaw) {
  $ref = $refRaw.Trim()
  if([string]::IsNullOrWhiteSpace($ref)) { return $null }

  # Strip query/hash
  $ref = $ref -replace '[?#].*$', ''

  # Skip non-files
  if($ref -eq '#' -or $ref.StartsWith('#')) { return $null }
  if($ref -match '^(https?:|mailto:|tel:|javascript:)') { return $null }

  $dir = Split-Path $pageFullPath -Parent

  # If it's absolute, keep it
  if($ref -match '^[A-Za-z]:\\') { return $ref }

  # If it starts at site-root, treat project root as site root
  if($ref.StartsWith('/')) { return (Join-Path $root ($ref.TrimStart('/'))) }

  # Otherwise resolve relative to the HTML file folder
  return (Join-Path $dir $ref)
}

foreach($p in $pages){
  $html = Get-Content -Path $p.FullName -Raw -ErrorAction Stop
  $dir = Split-Path $p.FullName -Parent

  # Stylesheet checks (must include <link rel="stylesheet" ...>)
  $stylesheetMatches = [regex]::Matches($html, '<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"([^"]+)"', 'IgnoreCase')
  if($stylesheetMatches.Count -lt 1){
    $stylesheetIssues.Add([pscustomobject]@{ Page=$p.FullName; Issue='Missing <link rel="stylesheet" ...>' }) | Out-Null
  } else {
    foreach($m in $stylesheetMatches){
      $href = $m.Groups[1].Value
      $resolved = Resolve-RefPath $p.FullName $href
      if($null -ne $resolved -and -not (Test-Path -LiteralPath $resolved)){
        $stylesheetIssues.Add([pscustomobject]@{ Page=$p.FullName; Issue=\"Stylesheet missing: $href -> $resolved\" }) | Out-Null
      }
    }
  }

  # href/src checks
  $matches = [regex]::Matches($html, '(href|src)\s*=\s*"([^"]+)"', 'IgnoreCase')
  foreach($m in $matches){
    $type = $m.Groups[1].Value
    $ref = $m.Groups[2].Value
    $resolved = Resolve-RefPath $p.FullName $ref
    if($null -eq $resolved) { continue }

    # Only validate local file targets we care about
    if($ref -match '(?i)\.(html|css|png|jpg|jpeg|gif|svg)$'){
      if(-not (Test-Path -LiteralPath $resolved)){
        $missing.Add([pscustomobject]@{ Page=$p.FullName; Type=$type; Ref=$ref; Resolved=$resolved }) | Out-Null
      }
    }
  }
}

"TOTAL HTML PAGES: $($pages.Count)"
"STYLESHEET ISSUES: $($stylesheetIssues.Count)"
"MISSING FILE REFERENCES: $($missing.Count)"

if($stylesheetIssues.Count -gt 0){
  '--- Stylesheet problems ---'
  $stylesheetIssues | Sort-Object Page | ForEach-Object {
    " - $($_.Page.Substring($root.Length+1)) :: $($_.Issue)"
  }
}

if($missing.Count -gt 0){
  '--- Missing href/src targets ---'
  $missing | Sort-Object Page,Ref | ForEach-Object {
    " - $($_.Page.Substring($root.Length+1)) [$($_.Type)] $($_.Ref) -> $($_.Resolved.Substring($root.Length+1))"
  }
}

