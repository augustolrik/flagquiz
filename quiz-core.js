/* Pure game rules for Flagquiz.  The browser app and Node based checks use the
   same small state machine so the scoring rules stay easy to reason about. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QuizCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROUND_COUNT = 10;

  function randomIndex(rng, length) {
    return Math.floor(rng() * length);
  }

  function shuffle(values, rng) {
    const result = Array.from(values || []);
    const random = typeof rng === 'function' ? rng : Math.random;
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.max(0, Math.min(i, randomIndex(random, i + 1)));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function countryCode(country) {
    return String(country && (country.code || country.id) || '').toUpperCase();
  }

  function countryName(country) {
    return String(country && country.name || countryCode(country));
  }

  function pickUnique(values, count, rng) {
    return shuffle(values, rng).slice(0, Math.max(0, count));
  }

  function makeOptions(correct, countries, rng) {
    const correctCode = countryCode(correct);
    const distractors = (countries || []).filter(function (country) {
      return countryCode(country) && countryCode(country) !== correctCode;
    });
    const chosen = pickUnique(distractors, 3, rng);
    return shuffle([correct].concat(chosen), rng);
  }

  function createCountryRound(country, countries, rng) {
    if (!country || !countryCode(country)) throw new Error('A round needs a country code');
    return {
      country: country,
      correctCode: countryCode(country),
      options: makeOptions(country, countries, rng)
    };
  }

  function normalizeGameArgs(roundsOrOptions, maybeRng) {
    if (typeof roundsOrOptions === 'function') {
      return { rounds: ROUND_COUNT, rng: roundsOrOptions };
    }
    if (typeof roundsOrOptions === 'number') {
      return { rounds: roundsOrOptions, rng: typeof maybeRng === 'function' ? maybeRng : Math.random };
    }
    const options = roundsOrOptions || {};
    return {
      rounds: Number.isFinite(options.rounds) ? options.rounds : ROUND_COUNT,
      rng: typeof options.rng === 'function' ? options.rng : Math.random
    };
  }

  function createGame(countries, roundsOrOptions, maybeRng) {
    const args = normalizeGameArgs(roundsOrOptions, maybeRng);
    const source = Array.from(countries || []).filter(function (country) {
      return countryCode(country);
    });
    const rounds = Math.min(Math.max(0, Math.floor(args.rounds)), source.length);
    const chosen = pickUnique(source, rounds, args.rng);
    return {
      rounds: chosen.map(function (country) {
        return createCountryRound(country, source, args.rng);
      }),
      currentIndex: 0,
      flagPoints: 0,
      mapPoints: 0,
      phase: chosen.length ? 'flag' : 'results',
      flagAnswer: null,
      mapAnswer: null,
      selectedMapCode: null,
      selectedMapPoint: null,
      history: [],
      complete: !chosen.length
    };
  }

  function currentRound(state) {
    return state && state.rounds && state.rounds[state.currentIndex];
  }

  function answerFlag(state, selectedCode) {
    if (!state || state.phase !== 'flag' || state.flagAnswer) return state;
    const round = currentRound(state);
    if (!round) return state;
    const selected = countryCode({ code: selectedCode });
    const correct = selected === round.correctCode;
    return Object.assign({}, state, {
      phase: 'flagAnswered',
      flagAnswer: { selectedCode: selected || null, correct: correct, points: correct ? 1 : 0 },
      flagPoints: state.flagPoints + (correct ? 1 : 0)
    });
  }

  function openMap(state) {
    if (!state || state.phase !== 'flagAnswered' || state.mapAnswer) return state;
    return Object.assign({}, state, { phase: 'map' });
  }

  function finishMap(state, selectedCode, skipped) {
    if (!state || state.phase !== 'map' || state.mapAnswer) return state;
    const round = currentRound(state);
    if (!round) return state;
    const selected = selectedCode ? countryCode({ code: selectedCode }) : null;
    const correct = !skipped && selected === round.correctCode;
    return Object.assign({}, state, {
      phase: 'roundComplete',
      mapAnswer: {
        selectedCode: selected,
        skipped: Boolean(skipped),
        correct: correct,
        points: correct ? 1 : 0
      },
      mapPoints: state.mapPoints + (correct ? 1 : 0)
    });
  }

  function answerMap(state, selectedCode) {
    return finishMap(state, selectedCode, false);
  }

  function skipMap(state) {
    return finishMap(state, null, true);
  }

  function nextRound(state) {
    if (!state || state.phase !== 'roundComplete') return state;
    const round = currentRound(state);
    const history = (state.history || []).concat([{
      roundIndex: state.currentIndex,
      correctCode: round && round.correctCode,
      flagAnswer: state.flagAnswer,
      mapAnswer: state.mapAnswer
    }]);
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.rounds.length) {
      return Object.assign({}, state, {
        phase: 'results',
        complete: true,
        history: history
      });
    }
    return Object.assign({}, state, {
      currentIndex: nextIndex,
      phase: 'flag',
      flagAnswer: null,
      mapAnswer: null,
      selectedMapCode: null,
      selectedMapPoint: null,
      history: history
    });
  }

  return {
    ROUND_COUNT: ROUND_COUNT,
    shuffle: shuffle,
    pickUnique: pickUnique,
    createCountryRound: createCountryRound,
    createGame: createGame,
    answerFlag: answerFlag,
    openMap: openMap,
    answerMap: answerMap,
    skipMap: skipMap,
    nextRound: nextRound
  };
});
