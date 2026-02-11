<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Pobierz kod autoryzacyjny z URL
$code = $_GET['code'] ?? null;
$error = $_GET['error'] ?? null;

if ($error) {
    // Użytkownik odmówił dostępu
    showError('Dostęp został odmówiony. Spróbuj ponownie.');
    exit;
}

if (!$code) {
    // Brak kodu - pokaż instrukcje autoryzacji
    showAuthInstructions();
    exit;
}

// Ładuj config
$config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);

if (!$config) {
    showError('Błąd konfiguracji - skontaktuj się z administratorem.');
    exit;
}

// Wymiana kodu na tokeny
$tokenData = exchangeCodeForTokens($code, $config);

if (!$tokenData) {
    showError('Nie udało się pobrać tokenów. Spróbuj ponownie.');
    exit;
}

// Pobierz dane profilu użytkownika
$userProfile = getUserProfile($tokenData['access_token']);

if (!$userProfile) {
    showError('Nie udało się pobrać danych profilu.');
    exit;
}

// Zapisz uczestnika do config.json
$success = addParticipant($userProfile, $tokenData['refresh_token'], $config);

if ($success) {
    showSuccess($userProfile);
} else {
    showError('Nie udało się zapisać danych.');
}

// === FUNKCJE POMOCNICZE ===

function exchangeCodeForTokens($code, $config) {
    $postData = [
        'client_id' => $config['strava_app']['client_id'],
        'client_secret' => $config['strava_app']['client_secret'],
        'code' => $code,
        'grant_type' => 'authorization_code'
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://www.strava.com/oauth/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        return json_decode($response, true);
    }
    
    return null;
}

function getUserProfile($accessToken) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://www.strava.com/api/v3/athlete');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $accessToken
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        return json_decode($response, true);
    }
    
    return null;
}

function addParticipant($userProfile, $refreshToken, &$config) {
    // Sprawdź czy użytkownik już istnieje
    $existingIndex = -1;
    foreach ($config['participants'] as $index => $participant) {
        if ($participant['strava_id'] == $userProfile['id']) {
            $existingIndex = $index;
            break;
        }
    }

    $participant = [
        'strava_id' => $userProfile['id'],
        'name' => $userProfile['firstname'] . ' ' . $userProfile['lastname'],
        'display_name' => $userProfile['firstname'],
        'refresh_token' => $refreshToken,
        'added_at' => date('Y-m-d H:i:s')
    ];

    if ($existingIndex >= 0) {
        // Aktualizuj istniejącego
        $config['participants'][$existingIndex] = $participant;
    } else {
        // Dodaj nowego
        $config['participants'][] = $participant;
    }

    // Zapisz config
    return file_put_contents(__DIR__ . '/config.json', json_encode($config, JSON_PRETTY_PRINT));
}

function showAuthInstructions() {
    $config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
    $clientId = $config['strava_app']['client_id'];
    $redirectUri = 'https://' . $_SERVER['HTTP_HOST'] . $_SERVER['SCRIPT_NAME'];
    
    $authUrl = "https://www.strava.com/oauth/authorize?" . http_build_query([
        'client_id' => $clientId,
        'response_type' => 'code',
        'redirect_uri' => $redirectUri,
        'approval_prompt' => 'auto',
        'scope' => 'read,activity:read'
    ]);
    
    echo "<!DOCTYPE html>
    <html>
    <head>
        <title>Autoryzacja Strava - #BETON</title>
        <style>
            body { 
                background: #1a1a1a; 
                color: #fff; 
                font-family: 'Space Mono', monospace; 
                text-align: center; 
                padding: 50px;
            }
            .container { max-width: 600px; margin: 0 auto; }
            .btn { 
                background: #006633; 
                color: white; 
                padding: 15px 30px; 
                text-decoration: none; 
                font-size: 18px; 
                border-radius: 5px;
                display: inline-block;
                margin: 20px 0;
            }
            .btn:hover { background: #004422; }
        </style>
    </head>
    <body>
        <div class='container'>
            <h1>#BETON Rywalizacja</h1>
            <p>Aby dołączyć do rywalizacji rowerowej, musisz połączyć swoje konto Strava.</p>
            <a href='$authUrl' class='btn'>🚴 Połącz ze Stravą</a>
            <p><small>Aplikacja pobierze tylko dostęp do odczytu Twoich aktywności.</small></p>
        </div>
    </body>
    </html>";
}

function showSuccess($userProfile) {
    echo "<!DOCTYPE html>
    <html>
    <head>
        <title>Sukces! - #BETON</title>
        <style>
            body { 
                background: #1a1a1a; 
                color: #fff; 
                font-family: 'Space Mono', monospace; 
                text-align: center; 
                padding: 50px;
            }
            .container { max-width: 600px; margin: 0 auto; }
            .success { color: #00ff88; font-size: 24px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class='container'>
            <h1>✅ Połączono!</h1>
            <div class='success'>Witaj, {$userProfile['firstname']}!</div>
            <p>Twoje konto Strava zostało połączone z rywalizacją #BETON.</p>
            <p>Możesz zamknąć to okno.</p>
        </div>
    </body>
    </html>";
}

function showError($message) {
    echo "<!DOCTYPE html>
    <html>
    <head>
        <title>Błąd - #BETON</title>
        <style>
            body { 
                background: #1a1a1a; 
                color: #fff; 
                font-family: 'Space Mono', monospace; 
                text-align: center; 
                padding: 50px;
            }
            .container { max-width: 600px; margin: 0 auto; }
            .error { color: #ff4444; font-size: 18px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class='container'>
            <h1>❌ Błąd</h1>
            <div class='error'>$message</div>
            <p><a href='?' style='color: #006633;'>← Spróbuj ponownie</a></p>
        </div>
    </body>
    </html>";
}
?>