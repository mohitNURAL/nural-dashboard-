# Installs the tools for the Nural dashboard. Run in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
# Skips anything already installed. Restart your PC after Docker Desktop installs.
$apps = @(
  @{ Id = 'OpenJS.NodeJS.LTS';            Name = 'Node.js LTS' },
  @{ Id = 'Git.Git';                      Name = 'Git' },
  @{ Id = 'Docker.DockerDesktop';         Name = 'Docker Desktop' },
  @{ Id = 'Microsoft.VisualStudioCode';   Name = 'VS Code' },
  @{ Id = 'Cloudflare.cloudflared';       Name = 'cloudflared (tunnel for webhook testing)' }
)
foreach ($a in $apps) {
  winget list --id $a.Id -e | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "Already installed: $($a.Name)" }
  else { Write-Host "Installing $($a.Name)..."; winget install --id $a.Id -e --accept-source-agreements --accept-package-agreements }
}
# Refresh PATH for this window
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
Write-Host 'Enabling pnpm...'
npm install -g pnpm@9
Write-Host 'Installing the Claude Code extension for VS Code...'
code --install-extension anthropic.claude-code
Write-Host ''
Write-Host 'Versions:'
node -v; pnpm -v; git --version; docker --version
Write-Host 'Done. If Docker shows no version, restart and open Docker Desktop once.'
