<?php
/**
 * Parties en ligne d'Scythe.
 *
 * Chaque partie (« salle ») est un fichier JSON. Le téléphone du joueur actif joue son tour avec le
 * moteur de règles et envoie l'état obtenu à la fin du tour ; le serveur vérifie que c'est bien son tour et que
 * personne n'a joué entre-temps (numéro de version), puis l'enregistre. Les autres téléphones
 * interrogent le serveur régulièrement.
 *
 * Compatible PHP 8.0 (hébergement OVH).
 *
 *   GET  room.php?code=K7P2Q&v=12   → état de la salle, ou {"unchanged":true} si la version n'a pas bougé
 *   POST room.php {"op":"create", "name", "token"}
 *   POST room.php {"op":"join", "code", "name", "token"}
 *   POST room.php {"op":"leave", "code", "token"}
 *   POST room.php {"op":"start", "code", "token", "state"}
 *   POST room.php {"op":"action", "code", "token", "version", "state"}
 */

declare(strict_types=1);

// Jamais d'erreur PHP affichée au visiteur (elle révélerait des chemins du serveur) ; elles vont au journal.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// Une partie pèse 10 à 30 Ko (plateau, état, journal) : 250 Ko laisse de la marge.
const MAX_BODY_BYTES = 250000;
const MAX_SEATS = 5;
const ROOM_TTL_SECONDS = 7 * 24 * 3600;
/** Salle jamais lancée : supprimée au bout d'un jour. */
const LOBBY_TTL_SECONDS = 24 * 3600;
/**
 * Plafond global : au pire 120 × 250 Ko = 30 Mo. L'hébergement est partagé avec le reste du site,
 * qui ne doit jamais manquer de place à cause du jeu.
 */
const MAX_ROOMS = 120;
/** Par adresse IP : 10 créations de salle par heure, 60 écritures par minute (largement assez pour jouer). */
const CREATE_LIMIT = [10, 3600];
const WRITE_LIMIT = [60, 60];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

/** Répond en JSON et termine. */
function reply(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $error, array $extra = []): void
{
    reply($status, ['error' => $error] + $extra);
}

/**
 * Dossier des salles. De préférence hors du site (/home/<compte>/scythe-data), pour que les
 * déploiements, qui synchronisent le dossier du site, ne l'effacent jamais.
 */
function data_dir(): string
{
    $env = getenv('SCYTHE_DATA_DIR');
    $candidates = $env ? [$env] : [dirname(__DIR__, 3) . '/scythe-data', __DIR__ . '/data'];
    foreach ($candidates as $dir) {
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
            if (str_starts_with($dir, __DIR__)) {
                // Repli dans le site : interdire tout accès direct par le web.
                @file_put_contents(
                    $dir . '/.htaccess',
                    "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n"
                );
            }
            return $dir;
        }
    }
    fail(500, 'storage');
}

function valid_code($code): bool
{
    return is_string($code) && preg_match('/^[' . CODE_ALPHABET . ']{' . CODE_LENGTH . '}$/', $code) === 1;
}

function valid_token($token): bool
{
    return is_string($token) && preg_match('/^[a-f0-9]{32}$/', $token) === 1;
}

/** Nom de joueur nettoyé : 1 à 20 caractères, sans caractères de contrôle. */
function clean_name($name): string
{
    if (!is_string($name)) {
        fail(400, 'invalid');
    }
    $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '');
    $name = function_exists('mb_substr') ? mb_substr($name, 0, 20) : substr($name, 0, 20);
    if ($name === '') {
        fail(400, 'invalid');
    }
    return $name;
}

function room_path(string $code): string
{
    return data_dir() . '/' . $code . '.json';
}

/**
 * Vue publique d'une salle : jamais les jetons des joueurs. « you » indique la place du téléphone
 * qui interroge (-1 s'il n'est pas assis).
 */
function public_view(array $room, ?string $token = null): array
{
    return [
        'code' => $room['code'],
        'status' => $room['status'],
        'version' => $room['version'],
        'seats' => array_map(fn ($s) => ['name' => $s['name']], $room['seats']),
        'state' => $room['state'],
        'you' => $token === null ? -1 : seat_of($room, $token),
    ];
}

function seat_of(array $room, string $token): int
{
    foreach ($room['seats'] as $i => $seat) {
        if (hash_equals($seat['token'], $token)) {
            return $i;
        }
    }
    return -1;
}

/**
 * Ouvre une salle avec un verrou exclusif, passe son contenu à $fn, et enregistre ce que $fn renvoie
 * (null : ne rien modifier ; false : supprimer la salle).
 */
function with_room(string $code, string $token, callable $fn): void
{
    $path = room_path($code);
    if (!is_file($path)) {
        fail(404, 'notFound');
    }
    $handle = fopen($path, 'c+');
    if ($handle === false) {
        fail(500, 'storage');
    }
    flock($handle, LOCK_EX);
    $room = json_decode((string) stream_get_contents($handle), true);
    if (!is_array($room)) {
        flock($handle, LOCK_UN);
        fclose($handle);
        fail(404, 'notFound');
    }
    $result = $fn($room);
    if ($result === false) {
        flock($handle, LOCK_UN);
        fclose($handle);
        @unlink($path);
        reply(200, ['deleted' => true]);
    }
    if (is_array($result)) {
        $result['updated'] = time();
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($result, JSON_UNESCAPED_UNICODE));
        fflush($handle);
        $room = $result;
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    reply(200, public_view($room, $token));
}

/**
 * Supprime les salles abandonnées (une semaine sans coup, ou un jour sans lancement) et les vieux
 * compteurs de limitation. Faite de temps en temps, ou systématiquement quand le plafond est atteint.
 */
function cleanup(bool $force = false): void
{
    if (!$force && random_int(1, 20) !== 1) {
        return;
    }
    $now = time();
    foreach (glob(data_dir() . '/*.json') ?: [] as $file) {
        $age = $now - (int) filemtime($file);
        if ($age > ROOM_TTL_SECONDS) {
            @unlink($file);
        } elseif ($age > LOBBY_TTL_SECONDS) {
            $room = json_decode((string) @file_get_contents($file), true);
            if (!is_array($room) || ($room['status'] ?? '') === 'lobby') {
                @unlink($file);
            }
        }
    }
    foreach (glob(data_dir() . '/rate/*') ?: [] as $file) {
        if ($now - (int) filemtime($file) > 86400) {
            @unlink($file);
        }
    }
}

function room_count(): int
{
    return count(glob(data_dir() . '/*.json') ?: []);
}

/**
 * Limite le nombre de requêtes d'une même adresse IP sur une fenêtre de temps.
 * Compteur dans un petit fichier par adresse (hachée : aucune IP n'est stockée en clair).
 */
function rate_limit(string $bucket, array $limit): void
{
    [$max, $window] = $limit;
    $dir = data_dir() . '/rate';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return; // Pas de quoi compter : on ne bloque pas le jeu pour autant.
    }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = $dir . '/' . $bucket . '-' . hash('sha256', $ip);
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return;
    }
    flock($handle, LOCK_EX);
    $data = json_decode((string) stream_get_contents($handle), true);
    $now = time();
    if (!is_array($data) || $now - (int) ($data['start'] ?? 0) >= $window) {
        $data = ['start' => $now, 'count' => 0];
    }
    $data['count']++;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data));
    flock($handle, LOCK_UN);
    fclose($handle);
    if ($data['count'] > $max) {
        header('Retry-After: ' . max(1, $window - ($now - $data['start'])));
        fail(429, 'rateLimited');
    }
}

/** Contrôle minimal d'un état de partie envoyé par un téléphone. */
function check_state($state, int $players): array
{
    if (!is_array($state) || ($state['version'] ?? null) !== 1 || !isset($state['players'], $state['status'], $state['board'])) {
        fail(400, 'invalid');
    }
    if (!is_array($state['players']) || count($state['players']) !== $players) {
        fail(400, 'invalid');
    }
    if ($state['status'] === 'playing' && !is_int($state['turn']['player'] ?? null)) {
        fail(400, 'invalid');
    }
    return $state;
}

/** Joueur dont c'est le tour dans l'état enregistré (-1 si la partie est finie). */
function current_player(array $state): int
{
    return ($state['status'] ?? '') === 'playing' ? (int) ($state['turn']['player'] ?? -1) : -1;
}

// --- Lecture ---------------------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = $_GET['code'] ?? null;
    if (!valid_code($code)) {
        fail(400, 'invalid');
    }
    $path = room_path($code);
    if (!is_file($path)) {
        fail(404, 'notFound');
    }
    $room = json_decode((string) file_get_contents($path), true);
    if (!is_array($room)) {
        fail(404, 'notFound');
    }
    if (isset($_GET['v']) && (int) $_GET['v'] === $room['version']) {
        reply(200, ['unchanged' => true, 'version' => $room['version']]);
    }
    $header = $_SERVER['HTTP_X_SCYTHE_TOKEN'] ?? null;
    reply(200, public_view($room, valid_token($header) ? $header : null));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'method');
}

// --- Écriture --------------------------------------------------------------

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY_BYTES) {
    fail(413, 'tooLarge');
}
$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
    fail(413, 'tooLarge');
}
$body = json_decode($raw, true);
if (!is_array($body) || !valid_token($body['token'] ?? null)) {
    fail(400, 'invalid');
}
$token = $body['token'];
$op = $body['op'] ?? '';
rate_limit('write', WRITE_LIMIT);

if ($op === 'create') {
    rate_limit('create', CREATE_LIMIT);
    cleanup();
    if (room_count() >= MAX_ROOMS) {
        cleanup(true);
        if (room_count() >= MAX_ROOMS) {
            fail(503, 'busy');
        }
    }
    $name = clean_name($body['name'] ?? null);
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $code = '';
        for ($i = 0; $i < CODE_LENGTH; $i++) {
            $code .= CODE_ALPHABET[random_int(0, strlen(CODE_ALPHABET) - 1)];
        }
        $room = [
            'code' => $code,
            'created' => time(),
            'updated' => time(),
            'status' => 'lobby',
            'version' => 1,
            'seats' => [['name' => $name, 'token' => $token]],
            'state' => null,
        ];
        // Mode « x » : échoue si le code existe déjà, sans écraser une autre salle.
        $handle = @fopen(room_path($code), 'x');
        if ($handle !== false) {
            fwrite($handle, json_encode($room, JSON_UNESCAPED_UNICODE));
            fclose($handle);
            reply(201, public_view($room, $token));
        }
    }
    fail(500, 'storage');
}

$code = $body['code'] ?? null;
if (!valid_code($code)) {
    fail(400, 'invalid');
}

switch ($op) {
    case 'join':
        $name = clean_name($body['name'] ?? null);
        with_room($code, $token, function (array $room) use ($token, $name) {
            $seat = seat_of($room, $token);
            if ($seat >= 0) {
                // Déjà assis (réouverture du lien) : on met juste le nom à jour dans la salle d'attente.
                if ($room['status'] !== 'lobby' || $room['seats'][$seat]['name'] === $name) {
                    return null;
                }
                $room['seats'][$seat]['name'] = $name;
            } else {
                if ($room['status'] !== 'lobby') {
                    fail(409, 'started');
                }
                if (count($room['seats']) >= MAX_SEATS) {
                    fail(409, 'full');
                }
                $room['seats'][] = ['name' => $name, 'token' => $token];
            }
            $room['version']++;
            return $room;
        });
        break;

    case 'leave':
        with_room($code, $token, function (array $room) use ($token) {
            $seat = seat_of($room, $token);
            if ($seat < 0 || $room['status'] !== 'lobby') {
                return null;
            }
            array_splice($room['seats'], $seat, 1);
            if (count($room['seats']) === 0) {
                return false;
            }
            $room['version']++;
            return $room;
        });
        break;

    case 'start':
        with_room($code, $token, function (array $room) use ($token, $body) {
            if (seat_of($room, $token) !== 0) {
                fail(403, 'notHost');
            }
            if ($room['status'] !== 'lobby') {
                fail(409, 'started');
            }
            if (count($room['seats']) < 2) {
                fail(409, 'tooFew');
            }
            $room['state'] = check_state($body['state'] ?? null, count($room['seats']));
            $room['status'] = 'playing';
            $room['version']++;
            return $room;
        });
        break;

    case 'action':
        with_room($code, $token, function (array $room) use ($token, $body) {
            if ($room['status'] !== 'playing') {
                fail(409, 'notStarted');
            }
            if (($body['version'] ?? null) !== $room['version']) {
                fail(409, 'conflict', ['room' => public_view($room, $token)]);
            }
            if (($room['state']['status'] ?? '') !== 'playing') {
                fail(409, 'over');
            }
            $seat = seat_of($room, $token);
            if ($seat < 0 || $seat !== current_player($room['state'])) {
                fail(403, 'notYourTurn');
            }
            $room['state'] = check_state($body['state'] ?? null, count($room['seats']));
            $room['version']++;
            return $room;
        });
        break;

    default:
        fail(400, 'invalid');
}
