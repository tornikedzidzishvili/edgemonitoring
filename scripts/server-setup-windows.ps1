Param(
  [Parameter(Mandatory=$true)][string]$HostIp,
  [string]$Domain = "monitoring.edge.ge",
  [string]$DeployUser = "edge"
)

$ErrorActionPreference = 'Stop'

$keyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
$pubPath = "$keyPath.pub"

if (-not (Test-Path -LiteralPath $keyPath)) { throw "Missing SSH key: $keyPath" }
if (-not (Test-Path -LiteralPath $pubPath)) { throw "Missing SSH public key: $pubPath (run: ssh-keygen -y -f $keyPath > $pubPath)" }

Write-Host "[1/4] Copy bootstrap script to server (root)"
scp -i $keyPath -o StrictHostKeyChecking=accept-new .\scripts\bootstrap-ubuntu.sh root@$HostIp:/root/bootstrap-ubuntu.sh

Write-Host "[2/4] Run bootstrap (creates deploy user, locks down SSH, enables firewall)"
ssh -i $keyPath root@$HostIp "chmod +x /root/bootstrap-ubuntu.sh; DEPLOY_USER='$DeployUser' DOMAIN='$Domain' /root/bootstrap-ubuntu.sh"

Write-Host "[3/4] Install your public key for the deploy user"
$pub = Get-Content -LiteralPath $pubPath -Raw
# Append the key remotely with safe quoting
$escaped = $pub.Replace('`','``').Replace('"','`"').Trim()
ssh -i $keyPath root@$HostIp "install -d -m 700 -o $DeployUser -g $DeployUser /home/$DeployUser/.ssh; echo \"$escaped\" >> /home/$DeployUser/.ssh/authorized_keys; chown $DeployUser:$DeployUser /home/$DeployUser/.ssh/authorized_keys; chmod 600 /home/$DeployUser/.ssh/authorized_keys"

Write-Host "[4/4] Next: SSH as deploy user"
Write-Host "ssh -i $keyPath $DeployUser@$HostIp"
Write-Host "Then run scripts/deploy-prod.sh on the server with SSH_KEY_MASTER_SECRET + CERTBOT_EMAIL."
