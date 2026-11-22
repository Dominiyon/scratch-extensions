(function(Scratch) {
  'use strict';
  var states = ['default']
  var curentState = 'default'
  if (!Scratch.extensions.unsandboxed) throw new Error('Must run unsandboxed');

  class Ext {
    getInfo() {
      return {
        id: 'dmnStates',
        name: 'States',
        blocks: [
          {
            blockType:  Scratch.BlockType.BUTTON,
            func: 'newState',
            text: 'Create new state',
          },
          {
            blockType:  Scratch.BlockType.BUTTON,
            func: 'deleteState',
            text: 'Delete state',
          },
          "---",
          {
            blockType: Scratch.BlockType.HAT,
            opcode: 'onSwitch',
            text: 'when state switched to [STATE]',
            isEdgeActivated: false,
            arguments: {
              STATE: {
                type: Scratch.ArgumentType.STRING,
                menu: "states"
              }
            }
          },
          {
            blockType: Scratch.BlockType.EVENT,
            opcode: 'onSwitchAny',
            text: 'on state switch',
            isEdgeActivated: false,
            arguments: {
              STATE: {
                type: Scratch.ArgumentType.STRING,
                menu: "states"
              }
            }
          },
          {
            blockType: Scratch.BlockType.COMMAND,
            opcode: 'switchState',
            text: 'switch state to [STATE] for all',
            isTerminal: true,
            arguments: {
              STATE: {
                type: Scratch.ArgumentType.STRING,
                menu: "statesAR"
              }
            },
          },
          {
            blockType: Scratch.BlockType.COMMAND,
            opcode: 'switchStateFor',
            text: 'switch state to [STATE] for [TARGET]',
            arguments: {
              STATE: {
                type: Scratch.ArgumentType.STRING,
                menu: "statesAR"
              },
              TARGET: {
                type: Scratch.ArgumentType.STRING,
                menu: "targets"
              }
            },
          },
          {
            blockType: Scratch.BlockType.COMMAND,
            opcode: 'switchStateSelf',
            text: 'switch state to [STATE] for myself',
            isTerminal: true,
            arguments: {
              STATE: {
                type: Scratch.ArgumentType.STRING,
                menu: "statesAR"
              }
            },
          },
          {
            blockType: Scratch.BlockType.REPORTER,
            opcode: 'currentState',
            text: 'current state'
          },
          {
            blockType: Scratch.BlockType.REPORTER,
            opcode: 'states',
            text: 'all states'
          }
        ],
        menus: {
          states: {
            acceptReporters: false,
            items: "statesMenu"
          },
          statesAR: {
            acceptReporters: true,
            items: "statesMenu"
          },
          targets: {
            acceptReporters: true,
            items: "targetMenu"
          }
        }
      };
    }
    constructor() {
      Scratch.vm.runtime.targets.forEach(target => target.dmnState = 'default');
    }

    deleteState() {
      const name = prompt("Delete:");
      if (name === 'default') return;
      if (states.indexOf(name) > -1) {
        states.splice(states.indexOf(name), 1)
      }
    }

    newState() {
      const name = prompt("New state name:");
      if (states.includes(name)) return;
      states.push(name);
    }

    onSwitch({STATE}, util) {
      return util.target.dmnState === STATE
    }

    statesMenu() {
      return states
    }

    targetMenu() {
      let targets = vm.runtime.targets.map(target => target.sprite.name);
      return targets;
    }

    switchState({STATE}, util) {
      if (states.includes(STATE)) {
        util.runtime.stopAll();
        util.runtime.targets.forEach(target => target.dmnState = STATE);
        util.startHats("dmnStates_onSwitchAny");
        util.startHats("dmnStates_onSwitch", {STATE});
      }
    }

    switchStateFor({STATE, TARGET}, util) {
      const target = util.runtime.getSpriteTargetByName(TARGET)
      if (states.includes(STATE) && target) {
        util.runtime.stopForTarget(target);
        target.dmnState = STATE;
        util.startHats("dmnStates_onSwitchAny", {}, target);
        util.startHats("dmnStates_onSwitch", {STATE}, target);
      }
    }

    switchStateSelf({STATE}, util) {
      const target = util.target
      if (states.includes(STATE)) {
        util.runtime.stopForTarget(target);
        target.dmnState = STATE;
        util.startHats("dmnStates_onSwitchAny", {}, target);
        util.startHats("dmnStates_onSwitch", {STATE}, target);
      }
    }

    currentState(_args, util) {
      return util.target.dmnState;
    }

    states() {
      return JSON.stringify(states);
    }
  }

  Scratch.vm.runtime.on('PROJECT_RUN_START', ()=>{
    Scratch.vm.runtime.targets.forEach(target => target.dmnState = 'default');
  })

  Scratch.extensions.register(new Ext());
})(Scratch);
