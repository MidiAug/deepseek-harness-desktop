// B49 — DSH selectors + DOM 容错助手（多候选 fallback，DSH 改 DOM 时只改此处）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var sel = {
    sidebar: '[data-slot="sidebar"]',
    sidebarCandidates: ['[data-slot="sidebar"]'],
    sessionHeader: '[data-slot="conversation.session.header"]',
    sessionHeaderCandidates: ['[data-slot="conversation.session.header"]'],
    sessionLogUtilities:
      '[data-slot="conversation.session.header.utilities"]',
    heroPrefix: '[data-slot^="conversation.hero."]',
    heroCandidates: [
      '[data-slot^="conversation.hero."]',
      '[data-phase="hero"]',
    ],
    phaseHero: '[data-phase="hero"]',
    phaseActive: '[data-phase="active"]',
    chatFlow: "[data-chat-flow-kind]",
    chatFlowCandidates: ["[data-chat-flow-kind]", "[data-chat-flow]"],
    trajectoryRow: "tr[data-trajectory-row-key]",
    trajectoryRowCandidates: ["tr[data-trajectory-row-key]"],
    trajectoryScroll: "[data-trajectory-scroll]",
    trajectoryScrollCandidates: ["[data-trajectory-scroll]"],
    trajectoryAreaCandidates: [
      "[data-trajectory-scroll]",
      "tr[data-trajectory-row-key]",
    ],
    trajectoryViewZoneCandidates: [
      "[data-trajectory-scroll]",
      "tr[data-trajectory-row-key]",
      '[data-slot="conversation.view"]',
      "[data-conversation-scroll]",
    ],
    trajectoryTabLabels: ["轨迹", "trajectory", "trace"],
    composerBar: '[data-slot="conversation.composer.bar"]',
    composerBarCandidates: [
      '[data-slot="conversation.composer.bar"]',
      '[data-slot="conversation.composer.dock"]',
    ],
    composerDock: '[data-slot="conversation.composer.dock"]',
    composerDockCandidates: ['[data-slot="conversation.composer.dock"]'],
    inputDockPrefix: '[data-slot^="conversation.input."]',
    inputDockCandidates: ['[data-slot^="conversation.input."]'],
    conversationView: '[data-slot="conversation.view"]',
    conversationViewCandidates: ['[data-slot="conversation.view"]'],
    conversationSession: '[data-slot="conversation.session"]',
    conversationRoot: '[data-slot="conversation"]',
    conversationScrollCandidates: [
      "[data-conversation-scroll]",
      '[data-slot="conversation.view"]',
      '[data-slot="conversation.session"]',
      '[data-slot="conversation"]',
    ],
    turnTailCandidates: [
      '[data-chat-flow-kind="turn-tail"]',
      "[data-turn-tail]",
      '[data-slot="conversation.chat.turnTail"]',
    ],
    assistantActionsCandidates: [
      '[data-slot="conversation.chat.assistant-actions"]',
    ],
    userMessageCandidates: ['[data-chat-flow-kind="user"]'],
    userHoverRoot: "[data-time-hover-root]",
    commandViewCandidates: ['[data-slot="conversation.chat.commandview"]'],
    editable:
      "textarea, input, [contenteditable='true'], [contenteditable='']",
    editableCandidates: [
      "textarea",
      "input",
      "[contenteditable='true']",
      "[contenteditable='']",
    ],
    messageFlowKinds: [
      "user",
      "assistant-step",
      "tool-call",
      "context",
      "command",
    ],
    chatAreaCandidates: [
      '[data-chat-flow-kind="user"]',
      '[data-chat-flow-kind="assistant-step"]',
      '[data-chat-flow-kind="tool-call"]',
      '[data-chat-flow-kind="context"]',
      '[data-chat-flow-kind="command"]',
      "[data-disclosure-row]",
      "[data-variant]",
      "[data-tool]",
      '[data-slot="conversation.chat.commandview"]',
      '[data-slot="tool.call.toolview"]',
      '[class*="thinkBody"]',
      '[class*="toolview"]',
      '[class*="toolView"]',
      '[class*="toolBody"]',
      '[class*="tool-body"]',
    ],
    jsonCopyButton: "[data-json-copy-button]",
    codeBlock: "[class*='md-code-block']",
    thinkBody: '[class*="thinkBody"]',
    toolView: '[data-slot="tool.call.toolview"]',
    toolViewCandidates: [
      '[data-slot="tool.call.toolview"]',
      '[class*="toolview"]',
      '[class*="toolView"]',
      '[class*="toolBody"]',
      '[class*="tool-body"]',
    ],
    disclosureRow: "[data-disclosure-row]",
    disclosureCandidates: [
      "[data-disclosure-row]",
      "[data-variant]",
      "[data-tool]",
      '[class*="thinkBody"]',
    ],
    segmentCandidates: [
      "[class*='md-code-block']",
      "pre",
      "blockquote",
      "table",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
    ],
    /** hygiene CSS：禁选 chrome 表面（含 * 后代） */
    hygieneNoSelectChrome: [
      '[data-slot="sidebar"], [data-slot="sidebar"] *',
      '[data-slot="conversation.session.header"], [data-slot="conversation.session.header"] *',
      '[data-slot^="conversation.hero."], [data-slot^="conversation.hero."] *',
      '[data-slot="conversation.composer.dock"], [data-slot="conversation.composer.dock"] *',
      '[data-slot="conversation.input.dock"], [data-slot="conversation.input.dock"] *',
      '[data-slot="conversation.input.left"], [data-slot="conversation.input.left"] *',
      '[data-slot="conversation.input.model"], [data-slot="conversation.input.model"] *',
      '[data-slot="conversation.input.plan"], [data-slot="conversation.input.plan"] *',
      '[data-slot="conversation.input.right"], [data-slot="conversation.input.right"] *',
      '[data-slot="conversation.input.attachments"], [data-slot="conversation.input.attachments"] *',
      '[data-slot="conversation.input.overlay"], [data-slot="conversation.input.overlay"] *',
      '[data-slot="conversation.composer.bar"] button',
      '[data-slot="conversation.composer.bar"] [role="combobox"]',
      '[data-slot="conversation.composer.bar"] [role="listbox"]',
      '[data-slot="conversation.composer.bar"] [role="menu"]',
      '[data-chat-flow-kind="turn-tail"], [data-chat-flow-kind="turn-tail"] *',
      "[data-turn-tail], [data-turn-tail] *",
      '[data-slot="conversation.chat.turnTail"], [data-slot="conversation.chat.turnTail"] *',
      '[data-slot="conversation.chat.assistant-actions"], [data-slot="conversation.chat.assistant-actions"] *',
      '[role="tooltip"], [role="tooltip"] *',
      "[data-dsh-shell-no-select], [data-dsh-shell-no-select] *",
    ],
  };

  function closest(target, selectorList) {
    if (!target || !target.closest || !selectorList) return null;
    for (var i = 0; i < selectorList.length; i++) {
      try {
        var el = target.closest(selectorList[i]);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function queryFirst(selectorList, root) {
    root = root || document;
    if (!selectorList) return null;
    for (var i = 0; i < selectorList.length; i++) {
      try {
        var el = root.querySelector(selectorList[i]);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function queryAllOrdered(selectorList, root) {
    root = root || document;
    var out = [];
    var seen = [];
    for (var i = 0; i < selectorList.length; i++) {
      try {
        var found = root.querySelectorAll(selectorList[i]);
        for (var j = 0; j < found.length; j++) {
          if (seen.indexOf(found[j]) < 0) {
            seen.push(found[j]);
            out.push(found[j]);
          }
        }
      } catch (e) {}
    }
    return out;
  }

  function isHygieneOn() {
    return global.__dshSelectionHygiene === true;
  }

  global.__dshShell = global.__dshShell || {};
  global.__dshShell.selectors = sel;
  global.__dshShell.dom = {
    closest: closest,
    queryFirst: queryFirst,
    queryAllOrdered: queryAllOrdered,
    isHygieneOn: isHygieneOn,
  };
})(typeof window !== "undefined" ? window : globalThis);
