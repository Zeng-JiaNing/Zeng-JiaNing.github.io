param([string]$url, [int]$sec = 8)
try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec $sec -UseBasicParsing
    "OK: $($r.StatusCode)"
} catch {
    $msg = $_.Exception.Message
    if ($msg.Length -gt 80) { $msg = $msg.Substring(0, 80) }
    "FAIL: $msg"
}
