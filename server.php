<?php
header('Content-Type: application/json');

$key = strtoupper(trim($_POST['key'] ?? ''));
$device = substr(preg_replace('/[^a-zA-Z0-9\-_]/', '', $_POST['device_id'] ?? ''), 0, 64);
$app = $_POST['app'] ?? '';

if ($key === '' || $device === '') {
    echo json_encode(['ok' => 0, 'msg' => 'missing key/device']);
    exit;
}

$pdo = new PDO('sqlite:' . __DIR__ . '/licenses.db');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$pdo->exec("CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  expire TEXT NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1
)");
$pdo->exec("CREATE TABLE IF NOT EXISTS devices (
  key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY(key, device_id)
)");

$c = (int)$pdo->query("SELECT COUNT(*) FROM licenses")->fetchColumn();
if ($c === 0) {
    $pdo->exec("INSERT INTO licenses(key, expire, max_devices) VALUES
      ('RZX-RIZX-BYTE-2026', '2027-12-31', 3)");
}

$st = $pdo->prepare("SELECT expire, max_devices, enabled FROM licenses WHERE key = ?");
$st->execute([$key]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if (!$row || !(int)$row['enabled']) {
    echo json_encode(['ok' => 0, 'msg' => 'invalid key']);
    exit;
}

$expire = $row['expire'];
$max = (int)$row['max_devices'];
if (strtotime($expire . ' 23:59:59') < time()) {
    echo json_encode(['ok' => 0, 'msg' => 'expired', 'expire' => $expire]);
    exit;
}

$st = $pdo->prepare("SELECT 1 FROM devices WHERE key = ? AND device_id = ?");
$st->execute([$key, $device]);
if (!$st->fetch()) {
    $st = $pdo->prepare("SELECT COUNT(*) FROM devices WHERE key = ?");
    $st->execute([$key]);
    $used = (int)$st->fetchColumn();
    if ($used >= $max) {
        echo json_encode([
            'ok' => 0,
            'msg' => 'max devices',
            'devices' => $used,
            'max_devices' => $max
        ]);
        exit;
    }
    $st = $pdo->prepare("INSERT INTO devices(key, device_id, last_seen) VALUES(?,?,?)");
    $st->execute([$key, $device, time()]);
} else {
    $st = $pdo->prepare("UPDATE devices SET last_seen = ? WHERE key = ? AND device_id = ?");
    $st->execute([time(), $key, $device]);
}

$st = $pdo->prepare("SELECT COUNT(*) FROM devices WHERE key = ?");
$st->execute([$key]);
$used = (int)$st->fetchColumn();

echo json_encode([
    'ok' => 1,
    'msg' => 'ok',
    'expire' => $expire,
    'devices' => $used,
    'max_devices' => $max
]);
