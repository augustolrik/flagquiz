(function () {
  'use strict';

  const core = window.QuizCore;
  const DATA = {
    countries: null,
    world: null,
    features: []
  };
  const dom = {};
  let state = null;
  let mapProjection = null;
  let mapPath = null;
  let mapZoom = null;
  let mapTransform = d3.zoomIdentity;
  let mapReady = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      'welcome-screen', 'quiz-screen', 'results-screen', 'error-screen', 'error-details',
      'start-game', 'retry-load', 'round-label', 'progress-fill', 'score-label',
      'flag-stage', 'flag-image', 'flag-options', 'flag-feedback', 'open-map',
      'map-stage', 'map-svg', 'country-layer', 'pin-layer', 'map-status', 'map-feedback',
      'map-country-flag', 'map-country-name',
      'confirm-map', 'skip-map', 'zoom-in', 'zoom-out', 'zoom-reset', 'zoom-level', 'map-result-actions',
      'show-correct-place', 'next-round', 'final-score', 'flag-score', 'map-score',
      'results-message', 'review-list', 'restart-game'
    ].forEach(function (id) { dom[id.replace(/-/g, '_')] = byId(id); });
  }

  function exposeInspection() {
    window.flagQuiz = Object.freeze({
      getState: function () {
        return state ? JSON.parse(JSON.stringify(state)) : null;
      },
      get state() {
        return state ? JSON.parse(JSON.stringify(state)) : null;
      },
      get mapProjection() { return mapProjection; },
      get mapTransform() { return mapTransform; },
      get features() { return DATA.features; }
    });
  }

  function countryCode(country) {
    return String(country && country.code || '').toUpperCase();
  }

  function countryByCode(code) {
    const wanted = String(code || '').toUpperCase();
    return DATA.countries.find(function (country) { return countryCode(country) === wanted; });
  }

  function currentRound() {
    return state && state.rounds[state.currentIndex];
  }

  function showOnly(section) {
    [dom.welcome_screen, dom.quiz_screen, dom.results_screen, dom.error_screen].forEach(function (node) {
      node.hidden = node !== section;
    });
  }

  function setLoading(isLoading) {
    dom.start_game.disabled = isLoading;
    dom.start_game.textContent = isLoading ? 'Henter kortet …' : 'Start quizzen →';
  }

  function renderError(error) {
    showOnly(dom.error_screen);
    dom.error_details.textContent = 'Prøv at genindlæse siden. ' + (error && error.message ? error.message : 'Datafilerne kunne ikke læses.');
  }

  async function loadData() {
    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch('assets/countries.json', { cache: 'no-store' }),
        fetch('assets/world.geojson', { cache: 'no-store' })
      ]);
      responses.forEach(function (response) {
        if (!response.ok) throw new Error('En datafil svarede ikke (' + response.status + ').');
      });
      const countries = await responses[0].json();
      const world = await responses[1].json();
      if (!Array.isArray(countries) || !countries.length) throw new Error('countries.json er tom.');
      if (!world || world.type !== 'FeatureCollection' || !Array.isArray(world.features)) throw new Error('world.geojson har ikke det forventede format.');
      DATA.countries = countries.map(function (country) {
        return { code: countryCode(country), name: String(country.name || country.code), mapPoint: country.mapPoint };
      }).filter(function (country) { return country.code && country.name; });
      DATA.world = world;
      DATA.features = world.features.filter(function (feature) {
        const code = String(feature && (feature.id || feature.properties && feature.properties.code) || '').toUpperCase();
        return code && feature && feature.geometry;
      }).map(function (feature) {
        const code = String(feature.id || feature.properties && feature.properties.code).toUpperCase();
        return Object.assign({}, feature, { id: code, properties: Object.assign({}, feature.properties, { code: code }) });
      });
      if (DATA.countries.length < 4 || DATA.features.length < 4) throw new Error('Der mangler lande i kortdataene.');
      setLoading(false);
      renderWelcomeMap();
      exposeInspection();
    } catch (error) {
      setLoading(false);
      renderError(error);
      throw error;
    }
  }

  function renderWelcomeMap() {
    const svg = d3.select('#welcome-map');
    svg.selectAll('*').remove();
    const projection = d3.geoEqualEarth().fitExtent([[20, 70], [620, 370]], { type: 'Sphere' });
    const path = d3.geoPath(projection).digits(2);
    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'welcome-arrow').attr('viewBox', '0 0 10 10')
      .attr('refX', 8).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto').append('path').attr('d', 'M1,1L9,5L1,9')
      .attr('fill', 'none').attr('stroke', '#172b44').attr('stroke-width', 1.6);
    svg.append('path').attr('class', 'welcome-ocean').attr('d', path({ type: 'Sphere' }));
    svg.append('path').attr('class', 'welcome-grid').attr('d', path(d3.geoGraticule10()));
    svg.append('g').selectAll('path').data(DATA.features).join('path')
      .attr('class', 'welcome-country').attr('d', path)
      .classed('welcome-country-target', function (feature) { return ['DK', 'PY', 'MY'].includes(feature.id); });
    [
      { code: 'dk', point: [10, 56], card: [320, 0], start: [358, 61] },
      { code: 'py', point: [-58, -23], card: [105, 385], start: [180, 385] },
      { code: 'my', point: [102, 4], card: [510, 357], start: [548, 357] }
    ].forEach(function (flag) {
      const destination = projection(flag.point);
      const start = flag.start;
      const dx = destination[0] - start[0], dy = destination[1] - start[1];
      const length = Math.hypot(dx, dy);
      const end = [destination[0] - dx / length * 5, destination[1] - dy / length * 5];
      svg.append('path').attr('class', 'welcome-leader')
        .attr('d', 'M' + start + ' Q' + [start[0], (start[1] + end[1]) / 2] + ' ' + end)
        .attr('marker-end', 'url(#welcome-arrow)');
      svg.append('circle').attr('class', 'welcome-dot').attr('cx', destination[0]).attr('cy', destination[1]).attr('r', 3.5);
      const card = svg.append('g').attr('data-flag', flag.code).attr('transform', 'translate(' + flag.card + ')');
      card.append('rect').attr('width', 86).attr('height', 61).attr('rx', 5).attr('class', 'welcome-flag-card');
      card.append('image').attr('href', 'assets/flags/' + flag.code + '.svg')
        .attr('x', 6).attr('y', 6).attr('width', 74).attr('height', 49).attr('preserveAspectRatio', 'xMidYMid meet');
    });
  }

  function setupMap() {
    if (mapReady || !window.d3 || !DATA.features.length) return;
    const svg = d3.select(dom.map_svg);
    mapProjection = d3.geoEqualEarth();
    mapProjection.fitExtent([[34, 31], [966, 589]], { type: 'FeatureCollection', features: DATA.features });
    mapPath = d3.geoPath(mapProjection).digits(6);
    d3.select(dom.map_svg).select('.graticule').attr('d', mapPath(d3.geoGraticule10()));
    const countryLayer = d3.select(dom.country_layer);
    countryLayer.selectAll('path').data(DATA.features, function (feature) { return feature.id; }).join('path')
      .attr('class', 'country')
      .attr('data-code', function (feature) { return feature.id; })
      .attr('d', mapPath)
      .on('click', function (event, feature) { selectMapLocation(event, feature.id); });
    mapZoom = d3.zoom().scaleExtent([1, 8192]).on('zoom', function (event) {
      mapTransform = event.transform;
      d3.select(dom.map_svg).select('.map-zoom-layer').attr('transform', mapTransform);
      dom.zoom_level.textContent = Math.round(mapTransform.k) + '×';
      positionPin();
      exposeInspection();
    });
    svg.call(mapZoom);
    d3.select(dom.map_svg).select('.map-ocean').on('click', function (event) { selectMapLocation(event, null); });
    mapReady = true;
    resetMap(false, true);
    exposeInspection();
  }

  function pointerInBase(event) {
    const point = d3.pointer(event, dom.map_svg);
    return mapTransform.invert(point);
  }

  function drawPin(point) {
    const layer = d3.select(dom.pin_layer);
    layer.selectAll('*').remove();
    if (!point) return;
    appendPin(point, 'map-pin-player');
  }

  function appendPin(point, className) {
    const pin = d3.select(dom.pin_layer).append('g').datum(point)
      .attr('class', 'map-pin ' + className).attr('transform', pinTransform(point));
    // The tip sits exactly on the chosen geographic point at every zoom level.
    pin.append('path').attr('d', 'M0,-31 C-8,-31 -12,-25 -12,-19 C-12,-11 0,0 0,0 C0,0 12,-11 12,-19 C12,-25 8,-31 0,-31 Z');
    pin.append('circle').attr('cy', -15).attr('r', 4);
    return pin;
  }

  function showAnswerPins() {
    const layer = d3.select(dom.pin_layer);
    const answer = state.mapAnswer;
    layer.selectAll('.map-pin-answer').remove();
    layer.select('.map-pin-player').classed('is-correct', answer.correct);
    if (!answer.correct) {
      const country = countryByCode(currentRound().correctCode);
      appendPin(mapProjection(country.mapPoint), 'map-pin-answer is-correct');
    }
  }

  function pinTransform(point) {
    const bounds = dom.map_svg.getBoundingClientRect();
    const viewportScale = Math.min(bounds.width / 1000, bounds.height / 620) || 1;
    const inverseScale = 1 / (Math.max(1, mapTransform.k || 1) * viewportScale);
    return 'translate(' + point[0] + ',' + point[1] + ') scale(' + inverseScale + ')';
  }

  function positionPin() {
    d3.select(dom.pin_layer).selectAll('.map-pin').attr('transform', function (point) { return pinTransform(point); });
  }

  function selectMapLocation(event, code) {
    if (!state || state.phase !== 'map') return;
    selectMapBaseLocation(pointerInBase(event), code);
  }

  function selectMapBaseLocation(point, code) {
    if (!state || state.phase !== 'map') return;
    state = Object.assign({}, state, { selectedMapCode: code ? String(code).toUpperCase() : null, selectedMapPoint: point });
    d3.select(dom.country_layer).selectAll('.country').classed('is-selected', function (feature) {
      return Boolean(code && feature.id === String(code).toUpperCase());
    });
    drawPin(point);
    dom.confirm_map.disabled = false;
    dom.map_status.textContent = code ? 'Din nål er sat. Tryk på “Svar med min placering”, når du er klar.' : 'Din nål er sat i havet. Tryk på “Svar med min placering”, når du er klar.';
    exposeInspection();
  }

  function resetMap(withRender, clearPlacement) {
    if (!mapReady || !mapZoom) return;
    mapTransform = d3.zoomIdentity;
    d3.select(dom.map_svg).interrupt().call(mapZoom.transform, mapTransform);
    if (clearPlacement) {
      if (state) state = Object.assign({}, state, { selectedMapCode: null, selectedMapPoint: null });
      d3.select(dom.country_layer).selectAll('.country').classed('is-selected is-correct is-wrong', false);
      drawPin(null);
    } else {
      positionPin();
    }
    if (withRender) renderMapState();
    exposeInspection();
  }

  function mapFeatureAtCenter() {
    if (!mapProjection) return null;
    const basePoint = mapTransform.invert([500, 310]);
    const coordinates = mapProjection.invert(basePoint);
    if (!coordinates) return { point: basePoint, code: null };
    const feature = DATA.features.find(function (item) { return d3.geoContains(item, coordinates); });
    return { point: basePoint, code: feature ? feature.id : null };
  }

  function handleMapKeydown(event) {
    if (!mapZoom || !state || state.phase !== 'map') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const distance = 70;
      const dx = event.key === 'ArrowLeft' ? distance : event.key === 'ArrowRight' ? -distance : 0;
      const dy = event.key === 'ArrowUp' ? distance : event.key === 'ArrowDown' ? -distance : 0;
      d3.select(dom.map_svg).call(mapZoom.translateBy, dx, dy);
    } else if (event.key === '+' || event.key === '=' || event.key === 'Add') {
      event.preventDefault();
      d3.select(dom.map_svg).call(mapZoom.scaleBy, 2);
    } else if (event.key === '-' || event.key === '_' || event.key === 'Subtract') {
      event.preventDefault();
      d3.select(dom.map_svg).call(mapZoom.scaleBy, .5);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const center = mapFeatureAtCenter();
      if (center) selectMapBaseLocation(center.point, center.code);
    }
  }

  function setMapResultClasses() {
    const round = currentRound();
    const answer = state.mapAnswer;
    const correctCode = round && round.correctCode;
    d3.select(dom.country_layer).selectAll('.country')
      .classed('is-selected', false)
      .classed('is-correct', function (feature) { return feature.id === correctCode; })
      .classed('is-wrong', function (feature) { return Boolean(answer && answer.selectedCode && feature.id === answer.selectedCode && feature.id !== correctCode); });
  }

  function zoomToFeature(feature) {
    if (!feature || !mapPath || !mapZoom) return;
    const bounds = mapPath.bounds(feature);
    const width = Math.max(.001, bounds[1][0] - bounds[0][0]);
    const height = Math.max(.001, bounds[1][1] - bounds[0][1]);
    const scale = Math.min(8192, Math.max(2.5, .72 / Math.max(width / 1000, height / 620)));
    const centerX = (bounds[0][0] + bounds[1][0]) / 2;
    const centerY = (bounds[0][1] + bounds[1][1]) / 2;
    const transform = d3.zoomIdentity.translate(500 - scale * centerX, 310 - scale * centerY).scale(scale);
    d3.select(dom.map_svg).transition().duration(650).call(mapZoom.transform, transform);
  }

  function renderMapState() {
    if (!state) return;
    const round = currentRound();
    const answer = state.mapAnswer;
    const isMapDone = state.phase === 'roundComplete';
    dom.confirm_map.hidden = isMapDone;
    dom.skip_map.hidden = isMapDone;
    dom.map_result_actions.hidden = !isMapDone;
    dom.confirm_map.disabled = !state.selectedMapPoint || isMapDone;
    dom.next_round.innerHTML = state.currentIndex >= state.rounds.length - 1
      ? 'Se min score <span aria-hidden="true">→</span>'
      : 'Næste flag <span aria-hidden="true">→</span>';
    if (!isMapDone) {
      dom.map_feedback.textContent = '';
      dom.map_feedback.className = 'map-feedback';
      return;
    }
    setMapResultClasses();
    showAnswerPins();
    const trueCountry = countryByCode(round.correctCode);
    const trueName = trueCountry ? trueCountry.name : round.correctCode;
    if (answer.skipped) {
      dom.map_feedback.className = 'map-feedback is-wrong';
      dom.map_feedback.innerHTML = 'Du sprang placeringen over. Den grønne nål viser <strong>' + escapeHtml(trueName) + '</strong>.';
    } else if (answer.correct) {
      dom.map_feedback.className = 'map-feedback is-correct';
      dom.map_feedback.innerHTML = 'Godt fundet! <strong>' + escapeHtml(trueName) + '</strong> giver dig <strong>1 point</strong>.';
    } else {
      dom.map_feedback.className = 'map-feedback is-wrong';
      dom.map_feedback.innerHTML = 'Den grønne nål viser, hvor <strong>' + escapeHtml(trueName) + '</strong> ligger. Her får du 0 point.';
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function scrollStageIntoView(stage) {
    if (!stage || typeof stage.scrollIntoView !== 'function') return;
    stage.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function renderFlag() {
    const round = currentRound();
    if (!round) return;
    const country = countryByCode(round.correctCode) || round.country;
    const total = state.rounds.length || 10;
    dom.round_label.textContent = 'Flag ' + (state.currentIndex + 1) + ' af ' + total;
    dom.progress_fill.style.width = ((state.currentIndex + 1) / total * 100) + '%';
    dom.score_label.textContent = state.flagPoints + state.mapPoints;
    dom.flag_image.src = 'assets/flags/' + round.correctCode.toLowerCase() + '.svg';
    dom.flag_image.alt = 'Flaget i denne runde';
    dom.map_country_name.textContent = country.name;
    dom.map_country_flag.src = 'assets/flags/' + round.correctCode.toLowerCase() + '.svg';
    dom.map_country_flag.alt = 'Flaget for ' + country.name;
    dom.flag_options.innerHTML = '';
    round.options.forEach(function (option) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-button';
      button.textContent = option.name;
      button.dataset.code = countryCode(option);
      button.addEventListener('click', function () { chooseFlag(button.dataset.code); });
      dom.flag_options.appendChild(button);
    });
    dom.flag_feedback.textContent = '';
    dom.open_map.hidden = true;
    dom.map_feedback.textContent = '';
    dom.map_result_actions.hidden = true;
    dom.map_status.textContent = 'Din nål venter på kortet.';
    showOnly(dom.quiz_screen);
    dom.flag_stage.hidden = false;
    dom.map_stage.hidden = true;
    resetMap(false, true);
    scrollStageIntoView(dom.flag_stage);
  }

  function chooseFlag(code) {
    const before = state;
    state = core.answerFlag(state, code);
    if (state === before) return;
    const round = currentRound();
    const trueCountry = countryByCode(round.correctCode) || round.country;
    const buttons = dom.flag_options.querySelectorAll('.answer-button');
    buttons.forEach(function (button) {
      button.disabled = true;
      const buttonCode = String(button.dataset.code).toUpperCase();
      if (buttonCode === round.correctCode) button.classList.add('is-correct');
      if (buttonCode === String(code).toUpperCase() && buttonCode !== round.correctCode) button.classList.add('is-wrong');
    });
    dom.flag_feedback.innerHTML = state.flagAnswer.correct
      ? 'Rigtigt! Det er <strong>' + escapeHtml(trueCountry.name) + '</strong>. <span class="point-up">+1 point</span>'
      : 'Det rigtige svar er <strong>' + escapeHtml(trueCountry.name) + '</strong>. Du fik 0 point for flaget. Nu kan du få 1 point på kortet.';
    dom.open_map.hidden = false;
    dom.score_label.textContent = state.flagPoints + state.mapPoints;
    exposeInspection();
  }

  function openMap() {
    const before = state;
    state = core.openMap(state);
    if (state === before) return;
    setupMap();
    resetMap(false, true);
    dom.flag_stage.hidden = true;
    dom.map_stage.hidden = false;
    dom.map_status.textContent = 'Klik på det sted, du tror landet ligger.';
    dom.map_feedback.textContent = '';
    dom.confirm_map.disabled = true;
    dom.confirm_map.hidden = false;
    dom.skip_map.hidden = false;
    dom.map_result_actions.hidden = true;
    dom.map_svg.focus({ preventScroll: true });
    scrollStageIntoView(dom.map_stage);
    exposeInspection();
  }

  function confirmMap() {
    const before = state;
    state = core.answerMap(state, state.selectedMapCode || null);
    if (state === before) return;
    renderMapState();
    dom.score_label.textContent = state.flagPoints + state.mapPoints;
    dom.map_status.textContent = 'Dit svar er låst. Se farverne på kortet.';
    exposeInspection();
  }

  function skipMap() {
    const before = state;
    state = core.skipMap(state);
    if (state === before) return;
    renderMapState();
    dom.score_label.textContent = state.flagPoints + state.mapPoints;
    dom.map_status.textContent = 'Placeringen er sprunget over.';
    exposeInspection();
  }

  function goNext() {
    state = core.nextRound(state);
    if (state.phase === 'results') renderResults();
    else renderFlag();
    exposeInspection();
  }

  function renderResults() {
    const total = state.rounds.length;
    const totalPoints = state.flagPoints + state.mapPoints;
    dom.final_score.textContent = totalPoints;
    dom.flag_score.textContent = state.flagPoints + ' / ' + total;
    dom.map_score.textContent = state.mapPoints + ' / ' + total;
    dom.results_message.textContent = totalPoints >= 18 ? 'Du har et fantastisk verdensblik!' : totalPoints >= 12 ? 'Flot rejse — du fandt mange spor på vejen.' : 'Hver runde er en ny lille opdagelse. Prøv igen og se, om du kan slå din score.';
    dom.review_list.innerHTML = '';
    state.rounds.forEach(function (round, index) {
      const history = state.history[index] || {};
      const country = countryByCode(round.correctCode) || round.country;
      const card = document.createElement('article');
      card.className = 'review-card';
      const img = document.createElement('img');
      img.src = 'assets/flags/' + round.correctCode.toLowerCase() + '.svg';
      img.alt = 'Flaget for ' + country.name;
      const details = document.createElement('div');
      const number = document.createElement('div');
      number.className = 'review-number';
      number.textContent = 'RUNDE ' + String(index + 1).padStart(2, '0');
      const heading = document.createElement('h3');
      heading.textContent = country.name;
      const points = document.createElement('div');
      points.className = 'review-points';
      points.innerHTML = 'Flag: <strong>' + (history.flagAnswer && history.flagAnswer.points ? '1' : '0') + '</strong> · Kort: <strong>' + (history.mapAnswer && history.mapAnswer.points ? '1' : '0') + '</strong>';
      details.append(number, heading, points);
      card.append(img, details);
      dom.review_list.appendChild(card);
    });
    showOnly(dom.results_screen);
    scrollStageIntoView(dom.results_screen);
  }

  function startGame() {
    if (!DATA.countries) return;
    state = core.createGame(DATA.countries, { rounds: 10 });
    setupMap();
    renderFlag();
    exposeInspection();
  }

  function bindEvents() {
    dom.start_game.addEventListener('click', startGame);
    dom.retry_load.addEventListener('click', function () { loadData().then(startGame).catch(function () {}); });
    dom.open_map.addEventListener('click', openMap);
    dom.confirm_map.addEventListener('click', confirmMap);
    dom.skip_map.addEventListener('click', skipMap);
    dom.next_round.addEventListener('click', goNext);
    dom.restart_game.addEventListener('click', startGame);
    dom.zoom_in.addEventListener('click', function () { if (mapZoom) d3.select(dom.map_svg).call(mapZoom.scaleBy, 2); });
    dom.zoom_out.addEventListener('click', function () { if (mapZoom) d3.select(dom.map_svg).call(mapZoom.scaleBy, .5); });
    dom.zoom_reset.addEventListener('click', function () { resetMap(true, false); });
    dom.show_correct_place.addEventListener('click', function () { const round = currentRound(); const feature = DATA.features.find(function (item) { return item.id === round.correctCode; }); zoomToFeature(feature); });
    dom.map_svg.addEventListener('keydown', handleMapKeydown);
    dom.map_svg.addEventListener('focus', function () { dom.map_svg.classList.add('keyboard-map-focus'); });
    dom.map_svg.addEventListener('blur', function () { dom.map_svg.classList.remove('keyboard-map-focus'); });
    window.addEventListener('resize', function () { if (mapReady) positionPin(); });
  }

  cacheDom();
  bindEvents();
  exposeInspection();
  loadData().catch(function () {});
})();
