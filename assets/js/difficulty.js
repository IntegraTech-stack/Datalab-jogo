/* DataLab — learning modes. Every player plays Iniciante (maximum help, smaller rewards); the choice was
   removed. Intermediário and Experiente stay defined only as tuning references. Every system reads the
   numbers from DL.learn(), so tuning lives here. */
(function () {
  'use strict';
  const DL = window.DL;
  const KEY = 'datalab.mode.v1';

  DL.MODES = {
    iniciante: {
      id: 'iniciante', name: 'Iniciante', short: 'INI', color: '#7ee0a1',
      desc: 'Ajuda máxima: passo a passo, dicas de comando e erros explicados.', tag: 'Recompensa menor',
      reward: 0.7,          // credits and company revenue
      incidentGap: 1.5,     // × the time between incidents (more calm)
      crewGrace: 30,        // seconds before the crew takes a found fault on its own
      autoHelp: true,       // the terminal opens the help card by itself
      helpAfter: 1,         // misses before the terminal suggests the help
      stepText: 'full',     // every step visible, with the command hint
      helpDepth: 'full',    // command, example, what it does and when to use it
      explainErrors: true,  // terminal errors come with an explanation
      crewHints: 'exact',   // what the crew says about problems: exact commands
      tips: true,           // explanatory toasts on new problems
    },
    intermediario: {
      id: 'intermediario', name: 'Intermediário', short: 'INT', color: '#a0c3ec',
      desc: 'Ajuda moderada: passos visíveis, dicas só quando você pede.', tag: 'Recompensa média',
      reward: 1, incidentGap: 1, crewGrace: 45, autoHelp: false, helpAfter: 3, stepText: 'full', helpDepth: 'example',
      explainErrors: false, crewHints: 'exact', tips: false,
    },
    experiente: {
      id: 'experiente', name: 'Experiente', short: 'EXP', color: '#ff7a17',
      desc: 'Pouca ajuda: só o objetivo, passos revelados ao concluir. Desafios maiores.', tag: 'Recompensa maior',
      reward: 1.35, incidentGap: 0.85, crewGrace: 75, autoHelp: false, helpAfter: 0, stepText: 'hidden', helpDepth: 'syntax',
      explainErrors: false, crewHints: 'vague', tips: false,
    },
  };
  DL.MODE_ORDER = ['iniciante', 'intermediario', 'experiente'];

  const current = 'iniciante';
  try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }

  DL.learn = () => DL.MODES[current];
  // the mode no longer changes; kept so older callers still work
  DL.setLearn = function () {};
  DL.onLearnChange = () => {};
})();
