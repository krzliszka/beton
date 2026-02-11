<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Ładuj konfigurację
$config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);

if (!$config) {
    http_response_code(500);
    echo json_encode(['error' => 'Błąd konfiguracji']);
    exit;
}

// Router
$action = $_GET['action'] ?? 'rankings';

switch ($action) {
    case 'rankings':
        getRankings($config);
        break;
    case 'refresh':
        refreshAllTokens($config);
        break;
    case 'segments':
        getSegments($config);
        break;
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Nieznana akcja']);
}

// === GŁÓWNA FUNKCJA - POBIERZ RANKINGI ===
function getRankings($config) {
    $cache_file = __DIR__ . '/cache_rankings.json';
    $cache_time = $config['settings']['cache_ttl_minutes'] * 60;

    // Sprawdź cache
    if (file_exists($cache_file) && (time() - filemtime($cache_file)) < $cache_time) {
        echo file_get_contents($cache_file);
        return;
    }

    $results = [];
    
    foreach ($config['participants'] as $participant) {
        $participantResults = [
            'name' => $participant['display_name'],
            'strava_id' => $participant['strava_id'],
            'segments' => [],
            'totals' => [
                'general' => 0,
                'gory' => 0,
                'sprint' => 0,
                'general_points' => 0,
                'gory_points' => 0,
                'sprint_points' => 0
            ]
        ];

        // Odświeżaj token jeśli trzeba
        $accessToken = refreshTokenIfNeeded($participant['refresh_token'], $config);
        
        if (!$accessToken) {
            continue; // Skip tego uczestnika przy błędzie tokena
        }

        // Pobierz wyniki dla każdego segmentu
        foreach ($config['segments'] as $segment) {
            $segmentResult = getSegmentResult($accessToken, $segment, $participant['strava_id'], $config);
            
            if ($segmentResult) {
                $participantResults['segments'][] = $segmentResult;
                
                // Dodaj do sum
                $time = $segmentResult['time'];
                $points = $segmentResult['points'];
                
                $participantResults['totals']['general'] += $time;
                $participantResults['totals']['general_points'] += $points;
                
                if ($segment['type'] === 'GORY') {
                    $participantResults['totals']['gory'] += $time;
                    $participantResults['totals']['gory_points'] += $points;
                } elseif ($segment['type'] === 'SPRINT') {
                    $participantResults['totals']['sprint'] += $time;
                    $participantResults['totals']['sprint_points'] += $points;
                }
            }
        }

        $results[] = $participantResults;
    }

    // Sortuj rankingi
    $rankings = [
        'general' => sortByKey($results, 'general'),
        'gory' => sortByKey($results, 'gory', 'GORY'),
        'sprint' => sortByKey($results, 'sprint', 'SPRINT'),
        'updated_at' => date('Y-m-d H:i:s')
    ];

    $output = json_encode($rankings, JSON_PRETTY_PRINT);
    
    // Zapisz cache
    file_put_contents($cache_file, $output);
    
    echo $output;
}

// === POBIERZ WYNIK UCZESTNIKA NA SEGMENCIE ===
function getSegmentResult($accessToken, $segment, $athleteId, $config) {
    $segmentId = $segment['id'];
    $startDate = $config['settings']['date_range']['start'];
    $endDate = $config['settings']['date_range']['end'];
    
    // API: Segment Efforts
    $url = "https://www.strava.com/api/v3/segments/$segmentId/all_efforts?" . http_build_query([
        'athlete_id' => $athleteId,
        'start_date_local' => $startDate,
        'end_date_local' => $endDate,
        'per_page' => 200
    ]);
    
    $efforts = makeStravaRequest($url, $accessToken);
    
    if (!$efforts || empty($efforts)) {
        return null; // Brak wyników
    }

    // Znajdź najlepszy czas (effort)
    $bestEffort = null;
    foreach ($efforts as $effort) {
        if (!$bestEffort || $effort['elapsed_time'] < $bestEffort['elapsed_time']) {
            $bestEffort = $effort;
        }
    }

    if (!$bestEffort) {
        return null;
    }

    // Oblicz punkty (im szybszy czas, tym więcej punktów)
    $time = $bestEffort['elapsed_time'];
    $basePoints = 1000;
    $multiplier = $segment['multiplier'] ?? 1.0;
    $points = round($basePoints * $multiplier / $time, 2);

    return [
        'segment_id' => $segmentId,
        'segment_name' => $segment['name'],
        'time' => $time,
        'points' => $points,
        'date' => $bestEffort['start_date_local'],
        'effort_id' => $bestEffort['id']
    ];
}

// === ODŚWIEŻ TOKEN JEŚLI TRZEBA ===
function refreshTokenIfNeeded($refreshToken, &$config) {
    // W prawdziwej implementacji sprawdziłbyś czy access_token nie wygasł
    // Na razie zawsze odświeżamy
    
    $postData = [
        'client_id' => $config['strava_app']['client_id'],
        'client_secret' => $config['strava_app']['client_secret'],
        'refresh_token' => $refreshToken,
        'grant_type' => 'refresh_token'
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
        $tokenData = json_decode($response, true);
        return $tokenData['access_token'];
    }
    
    return null;
}

// === ZAPYTANIE DO STRAVA API ===
function makeStravaRequest($url, $accessToken) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
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

// === SORTOWANIE RANKINGÓW ===
function sortByKey($results, $category, $segmentType = null) {
    $filtered = [];
    
    foreach ($results as $participant) {
        // Jeśli kategoria specyficzna, sprawdź czy ma jakieś wyniki tego typu
        if ($segmentType) {
            $hasResults = false;
            foreach ($participant['segments'] as $segment) {
                if (strpos($segment['segment_name'], $segmentType) !== false) {
                    $hasResults = true;
                    break;
                }
            }
            if (!$hasResults) continue;
        }
        
        $filtered[] = [
            'name' => $participant['name'],
            'strava_id' => $participant['strava_id'],
            'time' => $participant['totals'][$category],
            'points' => $participant['totals'][$category . '_points'],
            'segments_count' => count($participant['segments'])
        ];
    }
    
    // Sortuj po czasie (rosnąco - najszybszy pierwszy)
    usort($filtered, function($a, $b) {
        return $a['time'] <=> $b['time'];
    });
    
    return $filtered;
}

// === POMOCNICZE FUNKCJE ===
function refreshAllTokens($config) {
    echo json_encode(['message' => 'Tokeny odświeżone', 'time' => date('Y-m-d H:i:s')]);
}

function getSegments($config) {
    echo json_encode($config['segments']);
}
?>