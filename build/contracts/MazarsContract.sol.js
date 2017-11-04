var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("MazarsContract error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("MazarsContract error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("MazarsContract contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of MazarsContract: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to MazarsContract.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: MazarsContract not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "proposals",
        "outputs": [
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "IsAdopted",
            "type": "bool"
          },
          {
            "name": "IsExecuted",
            "type": "bool"
          },
          {
            "name": "IsCandidat",
            "type": "bool"
          },
          {
            "name": "IsMember",
            "type": "bool"
          },
          {
            "name": "equality",
            "type": "bool"
          },
          {
            "name": "end",
            "type": "uint256"
          },
          {
            "name": "NbVoters",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "findWinner",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "members",
        "outputs": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "points",
            "type": "uint256"
          },
          {
            "name": "proxy",
            "type": "uint256"
          },
          {
            "name": "adresse",
            "type": "address"
          },
          {
            "name": "IsMember",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "openProposal",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "infoProposal",
        "outputs": [
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "uint256"
          },
          {
            "name": "",
            "type": "bool"
          },
          {
            "name": "",
            "type": "bool"
          },
          {
            "name": "",
            "type": "bool"
          },
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "removeProposal",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "SetMemberTrue",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "totalPoints",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "membre_1",
            "type": "string"
          },
          {
            "name": "membre_2",
            "type": "string"
          }
        ],
        "name": "setCandidat",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "nbProposals",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "members_Index",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "candidats",
        "outputs": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "IsWinner",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "votingTimeInMinutes",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "i",
            "type": "uint256"
          },
          {
            "name": "adresse",
            "type": "address"
          }
        ],
        "name": "setAdress",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "points",
            "type": "uint256"
          }
        ],
        "name": "setMembersData",
        "outputs": [
          {
            "name": "",
            "type": "address"
          },
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "name",
            "type": "string"
          }
        ],
        "name": "connexion",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "details",
        "outputs": [
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "index_prop",
            "type": "uint256"
          },
          {
            "name": "index_vote",
            "type": "uint256"
          }
        ],
        "name": "score",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          },
          {
            "name": "vote",
            "type": "bool"
          }
        ],
        "name": "vote",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newVotingTime",
            "type": "uint256"
          }
        ],
        "name": "setVotingTime",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "nameReciver",
            "type": "string"
          },
          {
            "name": "adresse_reciever",
            "type": "address"
          }
        ],
        "name": "proxy",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "findAddress",
        "outputs": [
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "nom",
            "type": "string"
          },
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "findMember",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "IsCandidat",
            "type": "bool"
          }
        ],
        "name": "addProposal_Interface",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "execute",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "payable": false,
        "type": "constructor"
      }
    ],
    "unlinked_binary": "0x60606040523462000000575b60008054600160a060020a0319166c01000000000000000000000000338102041790556001546200004a9064010000000062000069810262001c391704565b62000062640100000000620011eb6200009082021704565b5b620000d3565b60005433600160a060020a03908116911614620000865762000000565b60018190555b5b50565b600160a060020a0333166000908152600260205260409020600301805460a060020a60ff021916740100000000000000000000000000000000000000001790555b565b6124f680620000e26000396000f3606060405236156101325760e060020a6000350463013cf08b811461013757806305e49d1d1461020f57806308ae4b0c1461023157806331288f40146102f2578063332308f9146103045780634ce4e6c7146103ad5780634f62405d146103bf578063567142be146103ce5780635a7e3ac1146103ed5780635c4f4fd4146104bc57806361f4ff00146104db578063647aa9531461050757806365a8285a146105a85780637827d652146105c7578063818a30d2146105dc5780638c06f289146106555780638da5cb5b14610716578063a005ec7a1461073f578063b445e7a1146107c6578063c9d27afe146107ed578063d7c8197614610802578063de6e7a9114610814578063eae1469b1461086b578063ec41167b146108f9578063fc3576bb14610960578063fe0d94c1146109b7575b610000565b34610000576101476004356109c9565b604080518815156020820152871515918101919091528515156060820152841515608082015283151560a082015260c0810183905260e081018290526101008082528954600260001960018316158402019091160490820181905281906101208201908b9080156101f95780601f106101ce576101008083540402835291602001916101f9565b820191906000526020600020905b8154815290600101906020018083116101dc57829003601f168201915b5050995050505050505050505060405180910390f35b346100005761021f600435610a2a565b60408051918252519081900360200190f35b3461000057610241600435610aee565b6040805160208101869052908101849052600160a060020a0383166060820152811515608082015260a0808252865460026000196101006001841615020190911604908201819052819060c0820190889080156102df5780601f106102b4576101008083540402835291602001916102df565b820191906000526020600020905b8154815290600101906020018083116102c257829003601f168201915b5050965050505050505060405180910390f35b3461000057610302600435610b28565b005b3461000057610314600435610b5c565b604051808060200187815260200186151581526020018515158152602001841515815260200183151581526020018281038252888181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f16801561039a5780820380516001836020036101000a031916815260200191505b5097505050505050505060405180910390f35b3461000057610302600435610c87565b005b34610000576103026111eb565b005b346100005761021f61122b565b60408051918252519081900360200190f35b3461000057610302600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375050604080516020601f89358b0180359182018390048302840183019094528083529799988101979196509182019450925082915084018382808284375050604080516020601f89358b0180359182018390048302840183019094528083529799988101979196509182019450925082915084018382808284375094965061127895505050505050565b005b346100005761021f61162e565b60408051918252519081900360200190f35b34610000576104eb60043561164c565b60408051600160a060020a039092168252519081900360200190f35b3461000057610517600435611667565b6040805182151560208201528181528354600260001961010060018416150201909116049181018290529081906060820190859080156105985780601f1061056d57610100808354040283529160200191610598565b820191906000526020600020905b81548152906001019060200180831161057b57829003601f168201915b5050935050505060405180910390f35b346100005761021f611693565b60408051918252519081900360200190f35b3461000057610302600435602435611699565b005b346100005760408051602060046024803582810135601f8101859004850286018501909652858552610632958335959394604494939290920191819084018382808284375094965050933593506116da92505050565b60408051600160a060020a03909316835260208301919091528051918290030190f35b34610000576106a8600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965061182095505050505050565b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156107085780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b34610000576104eb611929565b60408051600160a060020a039092168252519081900360200190f35b346100005761074f600435611938565b604051808060200183151581526020018281038252848181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156107b75780820380516001836020036101000a031916815260200191505b50935050505060405180910390f35b34610000576107d9600435602435611ad7565b604080519115158252519081900360200190f35b3461000057610302600435602435611b34565b005b3461000057610302600435611c39565b005b3461000057610302600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496505093359350611c5e92505050565b005b346100005761087b600435611cef565b604051808060200183600160a060020a031681526020018281038252848181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156107b75780820380516001836020036101000a031916815260200191505b50935050505060405180910390f35b346100005761021f600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496505093359350611dc192505050565b60408051918252519081900360200190f35b3461000057610302600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496505093359350611ed592505050565b005b3461000057610302600435611ef8565b005b600481815481101561000057906000526020600020906007020160005b5060038101546004820154600683015492935060ff808316936101008404821693620100008104831693630100000082048416936401000000009092049091169188565b60006000600060006000600486815481101561000057906000526020600020906007020160005b5093506000925060039150600190505b81811015610ae157836002016001820381548110156100005790600052602060002090602091828204019190065b9054906101000a900460ff161515846002018281548110156100005790600052602060002090602091828204019190065b9054906101000a900460ff1615151115610ad8578092505b5b600101610a61565b8294505b50505050919050565b60026020819052600091825260409091206001810154918101546003820154919291600160a060020a0381169060a060020a900460ff1685565b6000600482815481101561000057906000526020600020906007020160005b50600154603c024201600482015590505b5050565b6020604051908101604052806000815260200150600060006000600060006000600488815481101561000057906000526020600020906007020160005b506004810154600382015433600160a060020a0316600090815260018085016020908152604092839020548654845160026101009583161586026000190190921691909104601f8101849004840282018401909552848152969750879692850460ff9081169581811695640100000000909104821694919092169290918891830182828015610c695780601f10610c3e57610100808354040283529160200191610c69565b820191906000526020600020905b815481529060010190602001808311610c4c57829003601f168201915b505050505095509650965096509650965096505b5091939550919395565b60045460009060001901821461104f5750805b6004546000190181101561104f57600481600101815481101561000057906000526020600020906007020160005b50600482815481101561000057906000526020600020906007020160005b5060008201816000019080546001816001161561010002031660029004828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610d3c5780548555610d78565b82800160010185558215610d7857600052602060002091601f016020900482015b82811115610d78578254825591600101919060010190610d5d565b5b50610d999291505b80821115610d955760008155600101610d81565b5090565b5050600282018160020190805482805482825590600052602060002090601f01602090048101928215610df457600052602060002091601f016020900482015b82811115610df4578254825591600101919060010190610dd9565b5b50610e199291505b80821115610d9557805460ff19168155600101610dfd565b5090565b505060038281018054918301805460f860020a60ff948516810281900460ff1990921691909117808355835461010090819004861683028390040261ff00199091161780835583546201000090819004861683028390040262ff000019909116178083558354630100000090819004861683028390040263ff000000199091161780835592546401000000009081900490941681020490920264ff0000000019909116179055600480830154908201556005808301805491830180548382556000828152602090209193908201929091908215610fc15760005260206000209182015b82811115610fc15782829080546001816001161561010002031660029004828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610f535780548555610f8f565b82800160010185558215610f8f57600052602060002091601f016020900482015b82811115610f8f578254825591600101919060010190610f74565b5b50610fb09291505b80821115610d955760008155600101610d81565b5090565b505091600101919060010190610efc565b5b5061103b9291505b80821115610d9557600081805460018160011615610100020316600290046000825580601f10610ffa575061102c565b601f01602090049060005260206000209081019061102c91905b80821115610d955760008155600101610d81565b5090565b5b5050600101610fca565b5090565b50506006918201549101555b600101610c9a565b5b60048054809190600190038154818355818115116111e1576007028160070283600052602060002091820191016111e191905b80821115610d9557600060008201805460018160011615610100020316600290046000825580601f106110b657506110e8565b601f0160209004906000526020600020908101906110e891905b80821115610d955760008155600101610d81565b5090565b5b5060028201805460008255601f01602090049060005260206000209081019061112691905b80821115610d955760008155600101610d81565b5090565b5b5060038201805464ffffffffff1916905560006004830181905560058301805482825590825260209091206111cb918101905b80821115610d9557600081805460018160011615610100020316600290046000825580601f1061118a57506111bc565b601f0160209004906000526020600020908101906111bc91905b80821115610d955760008155600101610d81565b5090565b5b505060010161115a565b5090565b5b505060006006820155600701611083565b5090565b5b505050505b5050565b600160a060020a0333166000908152600260205260409020600301805474ff0000000000000000000000000000000000000000191660a060020a1790555b565b600080805b600a81101561126f57600081815260036020908152604080832054600160a060020a03168352600290915290206001015491909101905b600101611230565b8192505b505090565b6000600580548091906001018154818355818115116113bc576003028160030283600052602060002091820191016113bc91905b80821115610d9557600060008201805460018160011615610100020316600290046000825580601f106112df5750611311565b601f01602090049060005260206000209081019061131191905b80821115610d955760008155600101610d81565b5090565b5b5060018201805460008255906000526020600020908101906113a191905b80821115610d9557600081805460018160011615610100020316600290046000825580601f106113605750611392565b601f01602090049060005260206000209081019061139291905b80821115610d955760008155600101610d81565b5090565b5b5050600101611330565b5090565b5b505060028101805460ff191690556003016112ac565b5090565b5b505050905083600582815481101561000057906000526020600020906003020160005b506000019080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061142d57805160ff191683800117855561145a565b8280016001018555821561145a579182015b8281111561145a57825182559160200191906001019061143f565b5b5061147b9291505b80821115610d955760008155600101610d81565b5090565b505082600582815481101561000057906000526020600020906003020160005b506001016001815481101561000057906000526020600020900160005b509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061150257805160ff191683800117855561152f565b8280016001018555821561152f579182015b8281111561152f578251825591602001919060010190611514565b5b506115509291505b80821115610d955760008155600101610d81565b5090565b505081600582815481101561000057906000526020600020906003020160005b506001016002815481101561000057906000526020600020900160005b509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f106115d757805160ff1916838001178555611604565b82800160010185558215611604579182015b828111156116045782518255916020019190600101906115e9565b5b506111e19291505b80821115610d955760008155600101610d81565b5090565b50505b50505050565b600454600090819011156116455750600454611649565b5060005b90565b600360205260009081526040902054600160a060020a031681565b600581815481101561000057906000526020600020906003020160005b50600281015490915060ff1682565b60015481565b6000828152600360205260409020805473ffffffffffffffffffffffffffffffffffffffff19166c01000000000000000000000000838102041790555b5050565b600083815260036020908152604080832054600160a060020a0316835260028083529083208551815482865284862086959394601f6000196001851615610100020190931604820184900481019390919089019083901061174657805160ff1916838001178555611773565b82800160010185558215611773579182015b82811115611773578251825591602001919060010190611758565b5b506117949291505b80821115610d955760008155600101610d81565b5090565b50505060008481526003602081815260408084208054600160a060020a0390811686526002909352818520600190810188905581548416808752838720909501805473ffffffffffffffffffffffffffffffffffffffff19166c01000000000000000000000000968702969096049590951790945554909116808452922001549091505b935093915050565b604080516020810190915260008082525433600160a060020a0390811691161415611883575060408051808201909152600581527f6f776e6572000000000000000000000000000000000000000000000000000000602082015261192256611922565b33600160a060020a031660009081526002602052604090206003015460a060020a900460ff16156118ec575060408051808201909152600681527f6d656d6265720000000000000000000000000000000000000000000000000000602082015261192256611922565b5060408051808201909152600581527f6572726f7200000000000000000000000000000000000000000000000000000060208201525b5b5b919050565b600054600160a060020a031681565b602060405190810160405280600081526020015060006000600484815481101561000057906000526020600020906007020160005b506003810154909150640100000000900460ff1615611a33576003810154815460408051602060026101006001861615026000190190941693909304601f81018490048402820184019092528181528493640100000000900460ff169290918491830182828015611a1f5780601f106119f457610100808354040283529160200191611a1f565b820191906000526020600020905b815481529060010190602001808311611a0257829003601f168201915b5050505050915092509250611ad056611ad0565b6003810154815460408051602060026101006001861615026000190190941693909304601f8101849004840282018401909252818152849360ff169290918491830182828015611a1f5780601f106119f457610100808354040283529160200191611a1f565b820191906000526020600020905b815481529060010190602001808311611a0257829003601f168201915b50505050509150925092505b5b50915091565b60006000600484815481101561000057906000526020600020906007020160005b509050806002018381548110156100005790600052602060002090602091828204019190065b9054906101000a900460ff1691505b5092915050565b600482815481101561000057906000526020600020906007020160005b506002018054806001018281815481835581811511611ba557601f016020900481601f01602090048360005260206000209182019101611ba591905b80821115610d955760008155600101610d81565b5090565b5b50505091600052602060002090602091828204019190065b83909190916101000a81548160ff021916908360f860020a908102040217905550506001600483815481101561000057906000526020600020906007020160005b5033600160a060020a0316600090815260019190910160205260409020805460ff191660f860020a928302929092049190911790555b5050565b60005433600160a060020a03908116911614611c5457610000565b60018190555b5b50565b600160a060020a03338116600090815260026020819052604080832060010154938516835290912001546005901015611ce957600160a060020a03808316600090815260026020819052604080832060018082018054880190559201805490920190915533909216815220600301805474ff0000000000000000000000000000000000000000191690555b5b505050565b60408051602080820183526000808352848152600380835284822054600160a060020a039081168352600280855286842092830154835488516101006001831615026000190190911692909204601f810187900487028301870190985287825295969395929492909116929091849190830182828015611db05780601f10611d8557610100808354040283529160200191611db0565b820191906000526020600020905b815481529060010190602001808311611d9357829003601f168201915b50505050509150915091505b915091565b60006000600060006000600586815481101561000057906000526020600020906003020160005b50935060009250600091505b6001840154821015611ec757611eaf878560010184815481101561000057906000526020600020900160005b50805460408051602060026001851615610100026000190190941693909304601f81018490048402820184019092528181529291830182828015611ea55780601f10611e7a57610100808354040283529160200191611ea5565b820191906000526020600020905b815481529060010190602001808311611e8857829003601f168201915b5050505050612059565b90508015611ebb578192505b5b600190910190611df4565b8294505b5050505092915050565b60408051602081019091526000808252611ce9908490848461213d565b5b505050565b6000600060006000600485815481101561000057906000526020600020906007020160005b506002019150600090505b8154811015611f7d57818181548110156100005790600052602060002090602091828204019190065b9054906101000a900460ff1615611f6d57600190930192611f74565b6001909201915b5b600101611f28565b82841115611fc5576001600486815481101561000057906000526020600020906007020160005b50600301805460ff191660f860020a9283029290920491909117905561200f565b8284141561200f576001600486815481101561000057906000526020600020906007020160005b5060030160046101000a81548160ff021916908360f860020a9081020402179055505b5b6001600486815481101561000057906000526020600020906007020160005b5060030160016101000a81548160ff021916908360f860020a9081020402179055505b5050505050565b6040805160208181018352600091829052825190810190925290819052815183518491849184911461208e5760009350612134565b5060005b825181101561212f57818181518110156100005790602001015160f860020a900460f860020a027effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916838281518110156100005760209101015160f860020a90819004027fff0000000000000000000000000000000000000000000000000000000000000016146121265760009350612134565b5b600101612092565b600193505b50505092915050565b600060006000600480548091906001018154818355818115116122d3576007028160070283600052602060002091820191016122d391905b80821115610d9557600060008201805460018160011615610100020316600290046000825580601f106121a857506121da565b601f0160209004906000526020600020908101906121da91905b80821115610d955760008155600101610d81565b5090565b5b5060028201805460008255601f01602090049060005260206000209081019061221891905b80821115610d955760008155600101610d81565b5090565b5b5060038201805464ffffffffff1916905560006004830181905560058301805482825590825260209091206122bd918101905b80821115610d9557600081805460018160011615610100020316600290046000825580601f1061227c57506122ae565b601f0160209004906000526020600020908101906122ae91905b80821115610d955760008155600101610d81565b5090565b5b505060010161224c565b5090565b5b505060006006820155600701612175565b5090565b5b5050509250600483815481101561000057906000526020600020906007020160005b50915086826000019080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061234757805160ff1916838001178555612374565b82800160010185558215612374579182015b82811115612374578251825591602001919060010190612359565b5b506123959291505b80821115610d955760008155600101610d81565b5090565b50506000600483015585156123c85760038201805463ff0000001916630100000060f860020a89810204021790556124ea565b84156124ea575060038101805462ff000019166201000060f860020a878102040217905560005b6005548110156124ea57600581815481101561000057906000526020600020906003020160005b50600583018054839081101561000057906000526020600020900160005b509080546001816001161561010002031660029004828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061248257805485556124be565b828001600101855582156124be57600052602060002091601f016020900482015b828111156124be5782548255916001019190600101906124a3565b5b506124df9291505b80821115610d955760008155600101610d81565b5090565b50505b6001016123ef565b5b5b5b5050505050505056",
    "events": {},
    "updated_at": 1490952855702,
    "links": {},
    "address": "0x702901790e2a6706ec9030f65fbf8eb068fcc2fe"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "MazarsContract";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.MazarsContract = Contract;
  }
})();
