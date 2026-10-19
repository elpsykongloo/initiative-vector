(function () {
  "use strict";
  var S = window.SAMPLES;
  if (!S) return;
  var NS = "http://www.w3.org/2000/svg";
  var current = null; // the one clip that may play at a time
  var NARROW = window.matchMedia("(max-width: 719px)");
  var COARSE = window.matchMedia("(pointer: coarse)").matches;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    for (var k in attrs || {}) node.setAttribute(k, attrs[k]);
    return node;
  }
  function color(w) { return "var(--" + w + ")"; }
  function pct(x) { return (100 * x).toFixed(1) + "%"; }
  function f1(x) { return x.toFixed(1); }
  function f2(x) { return x.toFixed(2); }

  var PLAY = '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 16 16"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>';

  // Clip = audio file + activity lanes; listeners redraw anything synced to it (playhead, plot).
  function Clip(spec) {
    this.spec = spec;
    this.audio = null;
    this.listeners = [];
  }
  Clip.prototype.ensure = function () {
    if (this.audio) return this.audio;
    var a = new Audio(this.spec.audio);
    a.preload = "auto";
    var self = this;
    a.addEventListener("timeupdate", function () { self.emit(); });
    a.addEventListener("ended", function () { self.emit(); });
    a.addEventListener("pause", function () { self.emit(); });
    a.addEventListener("play", function () { self.emit(); });
    this.audio = a;
    return a;
  };
  Clip.prototype.emit = function () {
    var t = this.audio ? this.audio.currentTime : 0;
    var playing = this.audio && !this.audio.paused && !this.audio.ended;
    this.listeners.forEach(function (fn) { fn(t, playing); });
    if (playing) {
      var self = this;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(function () { self.emit(); });
    }
  };
  Clip.prototype.toggle = function () {
    var a = this.ensure();
    if (!a.paused) { a.pause(); return; }
    if (current && current !== this && current.audio) current.audio.pause();
    current = this;
    a.play();
  };
  Clip.prototype.seek = function (t) {
    var a = this.ensure();
    if (current && current !== this && current.audio) current.audio.pause();
    current = this;
    a.currentTime = Math.max(0, Math.min(S.window_s - 0.01, t));
    a.play();
  };

  function clock(t) {
    var s = Math.max(0, Math.floor(t));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }
  function player(spec, w, compact) {
    var clip = new Clip(spec);
    var btn = el("button", { "class": "play", type: "button", "aria-label": "Play " + (spec.title || "clip"), html: PLAY });
    btn.addEventListener("click", function () { clip.toggle(); });
    if (compact) {
      var time = el("span", { "class": "time", text: clock(0) + " / " + clock(S.window_s) });
      clip.listeners.push(function (t, playing) {
        time.textContent = clock(t) + " / " + clock(S.window_s);
        btn.innerHTML = playing ? PAUSE : PLAY;
        cnode.classList.toggle("is-playing", playing);
        btn.setAttribute("aria-label", (playing ? "Pause " : "Play ") + (spec.title || "clip"));
      });
      var cnode = el("div", { "class": "player compact" }, [btn, time, el("span", { "class": "hint", text: (COARSE ? "Tap" : "Click") + " the plot to play from that point" })]);
      cnode.clip = clip;
      return cnode;
    }
    var W = 1000, H = 34, L = S.window_s;
    var box = svg("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", role: "img",
      "aria-label": "Activity: grey = conversation partner, colored = model" });
    // partner lane is thin and recessive; the lane under comparison is the thick one
    box.appendChild(svg("rect", { "class": "lane-bg", x: 0, y: 4, width: W, height: 8, rx: 2 }));
    box.appendChild(svg("rect", { "class": "lane-bg", x: 0, y: 17, width: W, height: 15, rx: 3 }));
    (spec.user || []).forEach(function (s) {
      box.appendChild(svg("rect", { "class": "seg-user", x: s[0] / L * W, y: 4, width: Math.max(1, (s[1] - s[0]) / L * W), height: 8, rx: 2 }));
    });
    (spec.model || []).forEach(function (s) {
      box.appendChild(svg("rect", { fill: color(w), x: s[0] / L * W, y: 17, width: Math.max(1, (s[1] - s[0]) / L * W), height: 15, rx: 2 }));
    });
    var head = svg("line", { "class": "playhead", x1: 0, x2: 0, y1: 0, y2: H, opacity: 0, "vector-effect": "non-scaling-stroke" });
    box.appendChild(head);
    var lanes = el("div", { "class": "lanes" }, [box]);
    lanes.addEventListener("click", function (e) {
      var r = lanes.getBoundingClientRect();
      clip.seek((e.clientX - r.left) / r.width * L);
    });
    clip.listeners.push(function (t, playing) {
      head.setAttribute("x1", t / L * W); head.setAttribute("x2", t / L * W);
      head.setAttribute("opacity", playing ? 1 : (t > 0 ? 0.35 : 0));
      btn.innerHTML = playing ? PAUSE : PLAY;
      btn.setAttribute("aria-label", (playing ? "Pause " : "Play ") + (spec.title || "clip"));
      node.classList.toggle("is-playing", playing);
    });
    var node = el("div", { "class": "player" }, [btn, lanes]);
    node.clip = clip;
    return node;
  }

  function tabs(section, render) {
    var host = document.querySelector('.tabs[data-section="' + section + '"]');
    var buttons = [];
    var available = S.weights.filter(function (w) { return S[section][w.id]; });
    function select(id) {
      if (current && current.audio) current.audio.pause();
      buttons.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.id === id ? "true" : "false"); });
      render(id);
    }
    available.forEach(function (w) {
      var b = el("button", { "class": "tab", type: "button", role: "tab", "data-id": w.id }, [
        el("span", { "class": "dot", style: "background:" + color(w.id) }), el("span", { text: w.name })]);
      b.addEventListener("click", function () { select(w.id); });
      host.appendChild(b); buttons.push(b);
    });
    host.setAttribute("role", "tablist");
    select(S.defaults[section]);
  }

  // speech-ratio bar on a shared 0-100% scale; the tick marks the unsteered model on the same conversation
  function ratio(sr, base, fill) {
    return el("div", { "class": "val" }, [
      el("div", { "class": "bar" }, [el("i", { style: "width:" + (100 * sr) + "%;background:" + fill }),
        base == null ? null : el("b", { "class": "base", style: "left:" + (100 * base) + "%" })]),
      el("span", { "class": "pct", text: pct(sr) })]);
  }
  function rowHead(first) {
    return el("div", { "class": "row head", "aria-hidden": "true" }, [
      el("span", { text: first }), el("span", { text: "Partner / model, 25 s" }), el("span", { text: "Speech ratio" })]);
  }
  function nameOf(id) { return S.weights.filter(function (w) { return w.id === id; })[0].name; }
  function sessionLine(d, id, kind) {
    var shared = (d.shared_with || []).filter(function (x) { return x !== id; }).map(nameOf);
    return el("p", { "class": "meta", html: (kind || "Conversation") + " <code>" + d.session + "</code>, " + S.window_s + "-s excerpt" +
      (shared.length ? " · same conversation as " + shared.join(", ") : " · conversation chosen for this weight") + "." });
  }
  // stat tiles: [value, label]; the value sits in the same place on every tile
  function stats(items) {
    return el("div", { "class": "stats" }, items.map(function (s) {
      return el("div", { "class": "stat" }, [el("b", { html: s[0] }), el("span", { html: s[1] })]);
    }));
  }
  // lane legend: [label, css color]
  function legend(items) {
    return el("p", { "class": "legend" }, items.map(function (it) {
      return el("span", {}, [el("i", { "class": it[2] || "", style: "background:" + it[1] }), el("span", { text: it[0] })]);
    }));
  }

  // 1 · transfer
  function renderTransfer(id) {
    var d = S.transfer[id], panel = document.getElementById("transfer-panel");
    panel.innerHTML = "";
    panel.appendChild(sessionLine(d, id, "Target conversation"));
    panel.appendChild(legend([["Partner", "var(--user)", "thin"], ["Reference speaker", "var(--ref)"], [nameOf(id), color(id)], ["No steering", "var(--rand)"]]));
    // one no-steering clip per weight: the model's default, the same for every reference
    panel.appendChild(el("div", { "class": "default-row" }, [
      el("div", { "class": "default-head" }, [
        el("b", { text: "No steering" }),
        el("span", { text: nameOf(id) + "'s default on this conversation: one style for everyone · speech ratio " + pct(d["default"].desc.sr) })]),
      player(d["default"], "rand")]));
    var grid = el("div", { "class": "grid2" });
    d.items.forEach(function (it) {
      var table = el("table", { "class": "desc", html:
        "<colgroup><col><col class=\"n\"><col class=\"n\"><col class=\"n\"></colgroup>" +
        "<thead><tr><th></th><th>Ref.</th><th>Default</th><th>Calib.</th></tr></thead><tbody>" +
        "<tr><td>Speech ratio</td><td>" + pct(it.ref.desc.sr) + "</td><td>" + pct(d["default"].desc.sr) + "</td><td>" + pct(it.model.desc.sr) + "</td></tr>" +
        "<tr class=\"dist\"><td>Distance to ref. <small>SD</small></td><td>–</td><td>" + f2(it.dist.no_steering) + "</td><td class=\"win\">" + f2(it.dist.own) + "</td></tr></tbody>" });
      grid.appendChild(el("div", { "class": "card" }, [
        el("h3", { text: it.label + " reference" }),
        el("p", { "class": "sub", text: "Speech-ratio percentile " + Math.round(100 * it.pct) + " of 568 held-out speakers · dose " + it.dose }),
        el("div", { "class": "label", text: "Reference speaker · own conversation, 25 s of the 5-min recording" }),
        player(it.ref, "ref"),
        // the output is on the target conversation, not the reference's; the rule keeps the two from reading as one segment
        el("div", { "class": "label target", text: nameOf(id) + " · target conversation, calibrated to this reference" +
          (it.model.model.length ? "" : " · no speech in this 25 s") }),
        player(it.model, id),
        el("div", { "class": "tables" }, [table])
      ]));
    });
    panel.appendChild(grid);
    var st = d.stats;
    panel.appendChild(stats([
      [st.swap, "of reference pairs where another speaker's dose is worse"],
      [st.gain + "<small> SD</small>", "gain over the best single dose for everyone"],
      [st.share, "of the best-in-hindsight gain"],
      [st.spearman, "Spearman: calibrated model follows the reference speech ratio"]]));
    panel.appendChild(el("p", { "class": "note", text: "Speech ratio is computed over the whole 64-s target conversation (model, the clip's seed) and the whole 5-min recording (reference), not over the 25-s excerpts. Distance is the paper's match distance over speech ratio, overlap onsets and response probability (Eq. 3), in reference SD, averaged over three seeds on this conversation; lower is closer. In each reference clip the reference speaker's own partner is on the left, the reference speaker on the right." }));
  }

  // 2 · sweep
  function renderSweep(id) {
    var d = S.sweep[id], panel = document.getElementById("sweep-panel");
    panel.innerHTML = "";
    panel.appendChild(sessionLine(d, id));
    panel.appendChild(legend([["Partner", "var(--user)", "thin"], [nameOf(id), color(id)], ["Unsteered speech ratio", "var(--ink-2)", "tick"]]));
    var base = d.items.filter(function (it) { return it.dose === "0"; })[0].sr;
    var rows = el("div", { "class": "rows" }, [rowHead("Dose")]);
    d.items.forEach(function (it) {
      rows.appendChild(el("div", { "class": "row" }, [
        el("div", { "class": "dose", text: it.dose }),
        player(it, id),
        ratio(it.sr, base, color(id))
      ]));
    });
    panel.appendChild(rows);
    panel.appendChild(stats([
      ["+" + d.stats.inner + "<small> pts</small>", "speech ratio, +a vs −a, mean of 500 conversations"],
      [d.stats.rising + "<small> / 500</small>", "conversations where speech rises from −a to +a"]]));
    panel.appendChild(el("p", { "class": "note", text: "Speech ratio is measured over the whole 64-s conversation; the excerpt is the 25 s with the most partner turn ends." }));
  }

  // 3 · random directions
  function renderRandom(id) {
    var d = S.random[id], panel = document.getElementById("random-panel");
    panel.innerHTML = "";
    panel.appendChild(sessionLine(d, id));
    panel.appendChild(legend([["Partner", "var(--user)", "thin"], [nameOf(id) + ", initiative vector", color(id)], [nameOf(id) + ", random direction", "var(--rand)"]]));
    var rows = el("div", { "class": "rows" }, [rowHead("Direction")]);
    d.items.forEach(function (it) {
      var ours = it.kind === "initiative";
      rows.appendChild(el("div", { "class": ours ? "row ours" : "row" }, [
        el("div", { "class": "dose", text: it.name }),
        player(it, ours ? id : "rand"),
        ratio(it.sr, null, ours ? color(id) : "var(--rand)")
      ]));
    });
    panel.appendChild(rows);
    panel.appendChild(stats([
      ["≤ " + d.stats.max_random.replace(" points", "<small> pts</small>"), "speech ratio, +a vs −a, for each of three random directions (500 conversations)"],
      ["+" + d.stats.inner + "<small> pts</small>", "the same difference for the initiative vector"]]));
  }

  // 4 · readout
  function renderReadout(id) {
    var d = S.readout[id], panel = document.getElementById("readout-panel");
    panel.innerHTML = "";
    panel.appendChild(sessionLine(d, id));
    var p = player(d, id, true);
    renderReadout.last = id;
    // narrow screens get a narrower viewBox so the whole 25 s fits and labels stay legible
    var narrow = NARROW.matches;
    var W = narrow ? 560 : 1000, H = 300, top = narrow ? 30 : 22, ch = 188, L = S.window_s, X0 = narrow ? 96 : 64, X1 = W - 24;
    // Scale to the frames the readout is scored on (model silent); speaking frames are drawn faint and clipped.
    function speaking(t) {
      return (d.model || []).some(function (s) { return t >= s[0] - d.frame_s && t < s[1]; });
    }
    var silent = d.frames.filter(function (v, i) { return !speaking(i * d.frame_s); });
    var lo = Math.min.apply(null, silent), hi = Math.max.apply(null, silent);
    var pad = (hi - lo) * 0.12; lo -= pad; hi += pad * 2;
    function x(t) { return X0 + t / L * (X1 - X0); }
    function y(v) { return top + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * ch; }
    var plot = svg("svg", { "class": "plot", viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Projection on the initiative vector over time, with partner and model speech below" });
    var bandFill = "color-mix(in srgb, " + color(id) + " 20%, transparent)";
    var laneBottom = narrow ? 266 : 264;
    (d.onsets || []).forEach(function (t) {
      plot.appendChild(svg("rect", { x: x(Math.max(0, t - 0.8)), y: top, width: x(t) - x(Math.max(0, t - 0.8)), height: ch, fill: bandFill }));
      plot.appendChild(svg("line", { "class": "onset", x1: x(t), x2: x(t), y1: top, y2: laneBottom }));
    });
    plot.appendChild(svg("line", { "class": "axis", x1: X0, x2: X1, y1: top + ch, y2: top + ch }));
    // the readout is scored on silent frames only, so the curve is drawn only there
    var path = "", prev = false;
    d.frames.forEach(function (v, i) {
      var t = i * d.frame_s, sp = speaking(t);
      if (!sp) path += (prev ? "L" : "M") + x(t).toFixed(1) + "," + y(v).toFixed(1);
      prev = !sp;
    });
    plot.appendChild(svg("path", { "class": "curve", d: path }));
    for (var t = 0; t <= L; t += 5) {
      var tick = svg("text", { "class": "tick", x: x(t), y: H - 4, "text-anchor": t === 0 ? "start" : (t >= L ? "end" : "middle") });
      tick.textContent = t + " s"; plot.appendChild(tick);
    }
    var lab = svg("text", { "class": "tick", x: X0, y: narrow ? 20 : 12 }); lab.textContent = "h·u at L30"; plot.appendChild(lab);
    // lanes: [label, top, height, fill, segments]; the partner lane is thin, as in the players above
    [["Partner", narrow ? 226 : 230, 8, "var(--user)", d.user], ["Model", narrow ? 250 : 248, 16, color(id), d.model]].forEach(function (r) {
      var tg = svg("text", { "class": "tick", x: 0, y: r[1] + r[2] / 2 + 4 }); tg.textContent = r[0]; plot.appendChild(tg);
      plot.appendChild(svg("rect", { "class": "lane-bg", x: X0, y: r[1], width: X1 - X0, height: r[2], rx: 3 }));
      (r[4] || []).forEach(function (s) {
        plot.appendChild(svg("rect", { x: x(s[0]), y: r[1], width: Math.max(1, x(s[1]) - x(s[0])), height: r[2], rx: 2, fill: r[3] }));
      });
    });
    // hover guide: shows where a click will start playback
    var guide = svg("line", { "class": "guide", x1: X0, x2: X0, y1: top, y2: laneBottom, opacity: 0 });
    var guideT = svg("text", { "class": "tick guide-t", x: X0, y: top + 12, opacity: 0 });
    plot.appendChild(guide); plot.appendChild(guideT);
    if (!COARSE) {
      plot.addEventListener("mousemove", function (e) {
        var r = plot.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
        if (px < X0 || px > X1) { guide.setAttribute("opacity", 0); guideT.setAttribute("opacity", 0); return; }
        var t = (px - X0) / (X1 - X0) * L, right = px > X1 - 60;
        guide.setAttribute("x1", px); guide.setAttribute("x2", px); guide.setAttribute("opacity", 1);
        guideT.setAttribute("x", right ? px - 6 : px + 6); guideT.setAttribute("text-anchor", right ? "end" : "start");
        guideT.textContent = t.toFixed(1) + " s"; guideT.setAttribute("opacity", 1);
      });
      plot.addEventListener("mouseleave", function () { guide.setAttribute("opacity", 0); guideT.setAttribute("opacity", 0); });
    }
    var head = svg("line", { "class": "playhead", x1: X0, x2: X0, y1: top, y2: laneBottom, opacity: 0 });
    plot.appendChild(head);
    plot.style.cursor = "pointer";
    plot.addEventListener("click", function (e) {
      var r = plot.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      p.clip.seek((px - X0) / (X1 - X0) * L);
    });
    p.clip.listeners.push(function (t, playing) {
      head.setAttribute("x1", x(t)); head.setAttribute("x2", x(t)); head.setAttribute("opacity", playing ? 1 : (t > 0 ? 0.35 : 0));
    });
    panel.appendChild(el("div", { "class": "plot-box" }, [
      legend([["h·u while the model is silent", "var(--curve)", "line"], ["800 ms before a model onset", bandFill], [nameOf(id) + " speaking", color(id)], ["Partner", "var(--user)", "thin"]]),
      plot, p]));
    panel.appendChild(stats([
      [d.example.auc, "AUC on this conversation"],
      [d.stats.auc, "AUC for an onset within 800 ms, 500 held-out conversations"],
      ["+" + d.stats.gain, "over the timing-only baseline (" + d.stats.baseline + ")"],
      [d.stats.positive + "<small> / 500</small>", "conversations where the readout beats the baseline"]]));
    panel.appendChild(el("p", { "class": "note", text: "Dashed lines mark model onsets after at least 400 ms of silence; the shaded band is the 800 ms before each onset, the frames the direction is fitted to tell apart from continued silence. The curve is drawn only while the model is silent, the frames the readout is scored on." }));
  }

  NARROW.addEventListener("change", function () { if (renderReadout.last) renderReadout(renderReadout.last); });
  tabs("transfer", renderTransfer);
  tabs("sweep", renderSweep);
  tabs("random", renderRandom);
  tabs("readout", renderReadout);
  var copy = document.getElementById("copy-bib");
  if (copy) copy.addEventListener("click", function () {
    var code = document.querySelector(".bib code");
    function done(ok) { copy.textContent = ok ? "Copied" : "Selected, press Ctrl+C"; setTimeout(function () { copy.textContent = "Copy"; }, 2000); }
    function select() { var r = document.createRange(); r.selectNodeContents(code); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); done(false); }
    if (navigator.clipboard) navigator.clipboard.writeText(code.textContent).then(function () { done(true); }, select);
    else select();
  });
  // section nav: mark the section whose top has most recently passed under the bar
  var navLinks = [].slice.call(document.querySelectorAll(".secnav a"));
  function spy() {
    var on = null;
    navLinks.forEach(function (a) {
      var t = document.querySelector(a.getAttribute("href"));
      if (t && t.getBoundingClientRect().top < 120) on = a;
    });
    navLinks.forEach(function (a) { a.classList.toggle("on", a === on); });
    if (on && on !== spy.last) {
      var w = on.parentNode;
      if (on.offsetLeft < w.scrollLeft || on.offsetLeft + on.offsetWidth > w.scrollLeft + w.clientWidth)
        w.scrollTo({ left: on.offsetLeft - 16, behavior: "smooth" });
    }
    spy.last = on;
  }
  window.addEventListener("scroll", spy, { passive: true });
  spy();
  var body = document.getElementById("choice-body");
  body.appendChild(el("ul", {}, S.choice.map(function (c) { return el("li", { html: c }); })));
})();
