/*
  Wariya — Premiere Pro host script (ExtendScript, ES3).
  The panel calls these functions with evalScript. Every function returns a JSON string.
*/

var ES_TICKS_PER_SECOND = 254016000000;

function es_q(s) {
  s = String(s);
  var out = '"';
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i), code = s.charCodeAt(i);
    if (c === '"') out += '\\"';
    else if (c === '\\') out += '\\\\';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
    else out += c;
  }
  return out + '"';
}
function es_json(v) {
  if (v === null || v === undefined) return 'null';
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? String(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return es_q(v);
  if (v instanceof Array) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(es_json(v[i]));
    return '[' + a.join(',') + ']';
  }
  var parts = [];
  for (var k in v) { if (v.hasOwnProperty(k)) parts.push(es_q(k) + ':' + es_json(v[k])); }
  return '{' + parts.join(',') + '}';
}
function es_parse(str) {
  if (typeof JSON !== 'undefined' && JSON && typeof JSON.parse === 'function') {
    return JSON.parse(str);
  }
  // Validate that the string contains strictly valid JSON tokens before evaluating (RFC 4627)
  var s = String(str)
    .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
    .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
    .replace(/(?:^|:|,)(?:\s*\[)+/g, '');
  if (/^[\],:{}\s]*$/.test(s)) {
    return eval('(' + str + ')');
  }
  throw new Error('Invalid or unverified JSON passed to ExtendScript host');
}
function es_ok(o) { o = o || {}; o.ok = true; return es_json(o); }
function es_err(msg) { return es_json({ ok: false, error: String(msg) }); }

function es_norm(p) {
  p = String(p || '').replace(/\\/g, '/');
  if (Folder.fs === 'Windows') p = p.toLowerCase();
  return p;
}
function es_fps(seq) {
  var tb = Number(seq.timebase);
  if (!tb) return 0;
  return Math.round((ES_TICKS_PER_SECOND / tb) * 1000) / 1000;
}
function es_trackLocked(track) {
  try { if (typeof track.isLocked === 'function') return !!track.isLocked(); } catch (e) {}
  return false;
}
function es_trackFree(track, start, end) {
  var clips = track.clips;
  for (var i = 0; i < clips.numItems; i++) {
    var c = clips[i];
    var s = c.start.seconds, e = c.end.seconds;
    if (s < end - 0.0001 && e > start + 0.0001) return false;
  }
  return true;
}

/* Sequence and project information for the panel. */
function es_info() {
  try {
    if (!app.project) return es_ok({ hasProject: false });
    var info = { hasProject: true, projectPath: String(app.project.path || ''), sequence: null };
    var seq = app.project.activeSequence;
    if (seq) {
      var tracks = [];
      for (var i = 0; i < seq.videoTracks.numTracks; i++) {
        var tr = seq.videoTracks[i];
        tracks.push({ index: i, name: String(tr.name || ('V' + (i + 1))), locked: es_trackLocked(tr) });
      }
      var pos = seq.getPlayerPosition();
      info.sequence = {
        name: String(seq.name), width: Number(seq.frameSizeHorizontal), height: Number(seq.frameSizeVertical),
        fps: es_fps(seq), playhead: pos ? Number(pos.seconds) : 0, tracks: tracks
      };
    }
    return es_ok(info);
  } catch (e) { return es_err(e.message || e); }
}

function es_isBin(it) {
  try { if (typeof ProjectItemType !== 'undefined' && it.type === ProjectItemType.BIN) return true; } catch (e) {}
  return String(it.type) === 'BIN' || it.type === 2;
}
function es_findBin(name) {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var it = root.children[i];
    if (it && es_isBin(it) && it.name === name) return it;
  }
  var bin = root.createBin(name);
  return bin || root;
}
function es_findItemByPath(path, scope) {
  var want = es_norm(path);
  try {
    var found = app.project.rootItem.findItemsMatchingMediaPath(path, 1);
    if (found && found.length) return found[0];
  } catch (e) {}
  var stack = [scope || app.project.rootItem];
  while (stack.length) {
    var item = stack.pop();
    if (!item || !item.children) continue;
    for (var i = 0; i < item.children.numItems; i++) {
      var c = item.children[i];
      if (!c) continue;
      if (es_isBin(c)) { stack.push(c); continue; }
      try { if (es_norm(c.getMediaPath()) === want) return c; } catch (e2) {}
    }
  }
  return null;
}
function es_import(path, binName, name, fps, stills) {
  var bin = es_findBin(binName);
  var ok = app.project.importFiles([path], true, bin, !!stills);
  if (!ok) return null;
  var item = es_findItemByPath(path, bin);
  if (!item) return null;
  try { if (name) item.name = name; } catch (e) {}
  try { if (stills && fps && item.setOverrideFrameRate) item.setOverrideFrameRate(fps); } catch (e2) {}
  return item;
}
function es_place(item, track, seconds) {
  var t = new Time();
  t.seconds = seconds;
  try { track.overwriteClip(item, t.ticks); return true; } catch (e) {}
  try { track.overwriteClip(item, t); return true; } catch (e2) {}
  try { track.overwriteClip(item, seconds); return true; } catch (e3) {}
  return false;
}
// adds one empty video track (and an audio track beside it), or one audio track
function es_addTracks(seq, video) {
  var vBefore = seq.videoTracks.numTracks, aBefore = seq.audioTracks.numTracks;
  try {
    app.enableQE();
    var qs = qe.project.getActiveSequence();
    if (video) qs.addTracks(1, vBefore, 1, 1, aBefore);
    else qs.addTracks(0, vBefore, 1, 1, aBefore);
  } catch (e) {}
  return video ? seq.videoTracks.numTracks > vBefore : seq.audioTracks.numTracks > aBefore;
}

/*
  Import a file the panel exported and, when asked, put it at the playhead.
  args: { path, name, binName, mode ('bin' | 'timeline'), media ('video' | 'audio' | 'still'),
          stills (numbered PNG frames), fps, seconds, hasAudio }
  Video goes on the first free track above V1, so it lands over the footage instead of replacing it.
*/
function es_send(argsJSON) {
  try {
    var a = es_parse(argsJSON);
    if (!app.project) return es_err('Open a project in Premiere Pro first.');
    var item = es_import(a.path, a.binName || 'Wariya', a.name, a.fps, a.stills);
    if (!item) return es_err('Premiere could not import ' + a.path);
    if (a.mode !== 'timeline') return es_ok({ placed: false });
    var seq = app.project.activeSequence;
    if (!seq) return es_ok({ placed: false, note: 'No sequence is open, so it was only imported.' });
    var start = Number(seq.getPlayerPosition().seconds), end = start + Number(a.seconds || 5);
    var audio = a.media === 'audio', idx = -1, i, tr;
    if (audio) {
      for (i = 0; i < seq.audioTracks.numTracks; i++) {
        tr = seq.audioTracks[i];
        if (!es_trackLocked(tr) && es_trackFree(tr, start, end)) { idx = i; break; }
      }
      if (idx < 0 && es_addTracks(seq, false)) idx = seq.audioTracks.numTracks - 1;
      if (idx < 0) return es_ok({ placed: false, note: 'Every audio track has sound at the playhead, so it was only imported.' });
      tr = seq.audioTracks[idx];
    } else {
      // a clip with sound also lands on the audio track with the same number, so that one must be free too
      for (i = 1; i < seq.videoTracks.numTracks; i++) {
        tr = seq.videoTracks[i];
        if (es_trackLocked(tr) || !es_trackFree(tr, start, end)) continue;
        if (a.hasAudio && i < seq.audioTracks.numTracks && !es_trackFree(seq.audioTracks[i], start, end)) continue;
        idx = i; break;
      }
      if (idx < 0 && es_addTracks(seq, true)) idx = seq.videoTracks.numTracks - 1;
      if (idx < 0) return es_ok({ placed: false, note: 'Every video track above V1 has a clip at the playhead, so it was only imported. Add an empty track and try again, or drag it from the bin.' });
      tr = seq.videoTracks[idx];
    }
    if (!es_place(item, tr, start)) return es_ok({ placed: false, note: 'Premiere would not place it on the timeline, so it was only imported.' });
    return es_ok({ placed: true, start: start, trackName: String(tr.name || ((audio ? 'A' : 'V') + (idx + 1))) });
  } catch (e) { return es_err(e.message || e); }
}

/* The media files behind what is selected in the Project panel, or else on the timeline. */
function es_pick() {
  try {
    if (!app.project) return es_err('Open a project in Premiere Pro first.');
    var out = [], seen = {};
    var add = function (it) {
      if (!it) return;
      var p = '';
      try { p = String(it.getMediaPath() || ''); } catch (e) {}
      if (p && !seen[p]) { seen[p] = true; out.push({ path: p, name: String(it.name) }); }
    };
    try {
      var v = app.getCurrentProjectViewSelection();
      if (v) for (var i = 0; i < v.length; i++) add(v[i]);
    } catch (e1) {}
    if (!out.length && app.project.activeSequence) {
      var sel = app.project.activeSequence.getSelection();
      if (sel) for (var j = 0; j < sel.length; j++) if (sel[j] && sel[j].projectItem) add(sel[j].projectItem);
    }
    if (!out.length) return es_err('Select clips in the Project panel or on the timeline first, then press From Premiere again.');
    return es_ok({ items: out });
  } catch (e) { return es_err(e.message || e); }
}

function es_ping() { return es_ok({ version: String(app.version || '') }); }
