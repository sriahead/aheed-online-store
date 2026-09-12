
$ErrorActionPreference = "Continue"

Write-Host "Waiting for PR 731 checks..."
while ($true) {
  $output = gh pr checks 731 2>&1
  if ($LASTEXITCODE -eq 0) {
    break
  }
  Start-Sleep -Seconds 10
}

Write-Host "Merging PR 731 to staging..."
gh pr merge 731 --admin --merge

Write-Host "Switching to main and pulling..."
git checkout main
git pull origin main

Write-Host "Creating promotion PR..."
gh pr create --title "Promote staging to main (#714)" --body "Closes #714" --base main --head staging

$prNum = gh pr list --base main --head staging --json number --jq '.[0].number'

Write-Host "Waiting for PR $prNum checks..."
while ($true) {
  $output = gh pr checks $prNum 2>&1
  if ($LASTEXITCODE -eq 0) {
    break
  }
  Start-Sleep -Seconds 10
}

Write-Host "Merging PR $prNum to main..."
gh pr merge $prNum --admin --merge

