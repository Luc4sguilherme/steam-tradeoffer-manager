'use strict';

const SteamID = require('steamid');

const Helpers = require('../helpers.js');
const ETradeOfferState = require('../resources/ETradeOfferState.js');
const EConfirmationMethod = require('../resources/EConfirmationMethod.js');
const ETradeStatus = require('../resources/ETradeStatus.js');

class TradeOffer {
  constructor(manager, partner, token) {
    if (typeof partner === 'string') {
      this.partner = new SteamID(partner);
    } else {
      this.partner = partner;
    }

    if (
      !this.partner.isValid ||
      !this.partner.isValid() ||
      this.partner.type != SteamID.Type.INDIVIDUAL
    ) {
      throw new Error('Invalid input SteamID ' + this.partner);
    }

    Object.defineProperties(this, {
      _countering: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: null,
      },
      _tempData: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: {},
      },
      _token: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: token,
      },
      manager: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: manager,
      },
    });

    this.id = null;
    this.message = null;
    this.state = ETradeOfferState.Invalid;
    this.itemsToGive = [];
    this.itemsToReceive = [];
    this.isOurOffer = null;
    this.created = null;
    this.updated = null;
    this.expires = null;
    this.tradeID = null;
    this.fromRealTimeTrade = null;
    this.confirmationMethod = null;
    this.escrowEnds = null;
    this.rawJson = '';
  }

  isGlitched() {
    if (!this.id) {
      return false;
    }

    if (this.itemsToGive.length + this.itemsToReceive.length == 0) {
      return true;
    }

    if (
      this.manager._language &&
      this.itemsToGive.concat(this.itemsToReceive).some(item => !item.name)
    ) {
      return true;
    }

    return false;
  }

  containsItem(item) {
    return this.itemsToGive
      .concat(this.itemsToReceive)
      .some(offerItem => Helpers.itemEquals(offerItem, item));
  }

  data(key, value) {
    const pollData = this.manager.pollData;

    if (arguments.length < 1) {
      if (!this.id) {
        return this._tempData;
      }

      return (pollData.offerData && pollData.offerData[this.id]) || {};
    } else if (arguments.length < 2) {
      if (!this.id) {
        return this._tempData[key];
      }

      return (
        pollData.offerData &&
        pollData.offerData[this.id] &&
        pollData.offerData[this.id][key]
      );
    } else {
      switch (key) {
        case 'cancelTime':
          if (!this.isOurOffer) {
            throw new Error(
              `Cannot set cancelTime for offer #${this.id} as we did not send it.`,
            );
          }

          if (
            this.id &&
            this.state != ETradeOfferState.Active &&
            this.state != ETradeOfferState.CreatedNeedsConfirmation
          ) {
            throw new Error(
              `Cannot set cancelTime for offer #${this.id} as it is not active (${ETradeOfferState[this.state]}).`,
            );
          }

          break;
      }

      if (!this.id) {
        this._tempData[key] = value;
        return;
      }

      if (this.data(key) === value) {
        return;
      }

      pollData.offerData = pollData.offerData || {};
      pollData.offerData[this.id] = pollData.offerData[this.id] || {};
      pollData.offerData[this.id][key] = value;

      this.manager.emit('pollData', pollData);
    }
  }

  addMyItem(item) {
    return addItem(item, this, this.itemsToGive);
  }

  addMyItems(items) {
    let added = 0;
    const self = this;
    items.forEach(function (item) {
      if (self.addMyItem(item)) {
        added++;
      }
    });

    return added;
  }

  removeMyItem(item) {
    if (this.id) {
      throw new Error('Cannot remove items from an already-sent offer');
    }

    for (let i = 0; i < this.itemsToGive.length; i++) {
      if (Helpers.itemEquals(this.itemsToGive[i], item)) {
        this.itemsToGive.splice(i, 1);
        return true;
      }
    }

    return false;
  }

  removeMyItems(items) {
    let removed = 0;
    items.forEach(item => {
      if (this.removeMyItem(item)) {
        removed++;
      }
    });

    return removed;
  }

  addTheirItem(item) {
    return addItem(item, this, this.itemsToReceive);
  }

  addTheirItems(items) {
    let added = 0;
    items.forEach(item => {
      if (this.addTheirItem(item)) {
        added++;
      }
    });

    return added;
  }

  removeTheirItem(item) {
    if (this.id) {
      throw new Error('Cannot remove items from an already-sent offer');
    }

    for (let i = 0; i < this.itemsToReceive.length; i++) {
      if (Helpers.itemEquals(this.itemsToReceive[i], item)) {
        this.itemsToReceive.splice(i, 1);
        return true;
      }
    }

    return false;
  }

  removeTheirItems(items) {
    let removed = 0;
    items.forEach(item => {
      if (this.removeTheirItem(item)) {
        removed++;
      }
    });

    return removed;
  }

  send(callback) {
    if (this.id) {
      Helpers.makeAnError(
        new Error('This offer has already been sent'),
        callback,
      );
      return;
    }

    if (this.itemsToGive.length + this.itemsToReceive.length == 0) {
      Helpers.makeAnError(
        new Error('Cannot send an empty trade offer'),
        callback,
      );
      return;
    }

    function itemMapper(item) {
      return {
        appid: item.appid,
        contextid: item.contextid,
        amount: item.amount || 1,
        assetid: item.assetid,
      };
    }

    const offerdata = {
      newversion: true,
      version: this.itemsToGive.length + this.itemsToReceive.length + 1,
      me: {
        assets: this.itemsToGive.map(itemMapper),
        currency: [], // TODO
        ready: false,
      },
      them: {
        assets: this.itemsToReceive.map(itemMapper),
        currency: [],
        ready: false,
      },
    };

    const params = {};
    if (this._token) {
      params.trade_offer_access_token = this._token;
    }

    this.manager._pendingOfferSendResponses++;

    this.manager._community.httpRequestPost(
      'https://steamcommunity.com/tradeoffer/new/send',
      {
        headers: {
          referer:
            `https://steamcommunity.com/tradeoffer/${this.id || 'new'}/?partner=${this.partner.accountid}` +
            (this._token ? '&token=' + this._token : ''),
        },
        json: true,
        form: {
          sessionid: this.manager._community.getSessionID(),
          serverid: 1,
          partner: this.partner.toString(),
          tradeoffermessage: this.message || '',
          json_tradeoffer: JSON.stringify(offerdata),
          captcha: '',
          trade_offer_create_params: JSON.stringify(params),
          tradeofferid_countered: this._countering,
        },
        checkJsonError: false,
        checkHttpError: false,
      },
      (err, response, body) => {
        this.manager._pendingOfferSendResponses--;

        if (err) {
          Helpers.makeAnError(err, callback);
          return;
        }

        if (response.statusCode != 200) {
          if (response.statusCode == 401) {
            this.manager._notifySessionExpired(new Error('HTTP error 401'));
            Helpers.makeAnError(new Error('Not Logged In'), callback);
            return;
          }

          Helpers.makeAnError(
            new Error('HTTP error ' + response.statusCode),
            callback,
            body,
          );
          return;
        }

        if (!body) {
          Helpers.makeAnError(new Error('Malformed JSON response'), callback);
          return;
        }

        if (body && body.strError) {
          Helpers.makeAnError(null, callback, body);
          return;
        }

        if (body && body.tradeofferid) {
          this.id = body.tradeofferid;
          this.state = ETradeOfferState.Active;
          this.created = new Date();
          this.updated = new Date();
          this.expires = new Date(Date.now() + 1209600000);

          for (const i in this._tempData) {
            if (Object.prototype.hasOwnProperty.call(this._tempData, i)) {
              this.manager.pollData.offerData =
                this.manager.pollData.offerData || {};
              this.manager.pollData.offerData[this.id] =
                this.manager.pollData.offerData[this.id] || {};
              this.manager.pollData.offerData[this.id][i] = this._tempData[i];
            }
          }

          delete this._tempData;
        }

        this.confirmationMethod = EConfirmationMethod.None;

        if (body && body.needs_email_confirmation) {
          this.state = ETradeOfferState.CreatedNeedsConfirmation;
          this.confirmationMethod = EConfirmationMethod.Email;
        }

        if (body && body.needs_mobile_confirmation) {
          this.state = ETradeOfferState.CreatedNeedsConfirmation;
          this.confirmationMethod = EConfirmationMethod.MobileApp;
        }

        this.manager.pollData.sent = this.manager.pollData.sent || {};
        this.manager.pollData.sent[this.id] = this.state;
        this.manager.emit('pollData', this.manager.pollData);

        if (!callback) {
          return;
        }

        if (body && this.state == ETradeOfferState.CreatedNeedsConfirmation) {
          callback(null, 'pending');
        } else if (body && body.tradeofferid) {
          callback(null, 'sent');
        } else {
          callback(new Error('Unknown response'));
        }
      },
      'tradeoffermanager',
    );
  }

  decline(callback) {
    if (!this.id) {
      Helpers.makeAnError(
        new Error('Cannot cancel or decline an unsent offer'),
        callback,
      );
      return;
    }

    if (
      this.state != ETradeOfferState.Active &&
      this.state != ETradeOfferState.CreatedNeedsConfirmation
    ) {
      Helpers.makeAnError(
        new Error(
          `Offer #${this.id} is not active, so it may not be cancelled or declined`,
        ),
        callback,
      );
      return;
    }

    this.manager._community.httpRequestPost(
      `https://steamcommunity.com/tradeoffer/${this.id}/${this.isOurOffer ? 'cancel' : 'decline'}`,
      {
        headers: {
          referer:
            `https://steamcommunity.com/tradeoffer/${this.id}/?partner=${this.partner.accountid}` +
            (this._token ? '&token=' + this._token : ''),
        },
        json: true,
        form: {
          sessionid: this.manager._community.getSessionID(),
        },
        checkJsonError: false,
        checkHttpError: false,
      },
      (err, response, body) => {
        if (err) {
          Helpers.makeAnError(err, callback);
          return;
        }

        if (response.statusCode != 200) {
          if (response.statusCode == 401) {
            this.manager._community._notifySessionExpired(
              new Error('HTTP error 401'),
            );
            Helpers.makeAnError(new Error('Not Logged In'), callback);
            return;
          }

          Helpers.makeAnError(
            new Error('HTTP error ' + response.statusCode),
            callback,
            body,
          );
          return;
        }

        if (!body) {
          Helpers.makeAnError(new Error('Malformed JSON response'), callback);
          return;
        }

        if (body && body.strError) {
          Helpers.makeAnError(null, callback, body);
          return;
        }

        if (body && body.tradeofferid !== this.id) {
          Helpers.makeAnError('Wrong response', callback);
        }
        this.state = this.isOurOffer
          ? ETradeOfferState.Canceled
          : ETradeOfferState.Declined;
        this.updated = new Date();

        if (callback) {
          callback(null);
        }

        this.manager.doPoll();
      },
      'tradeoffermanager',
    );
  }

  cancel(callback) {
    this.decline(callback);
  }

  accept(skipStateUpdate, callback) {
    if (typeof skipStateUpdate === 'undefined') {
      skipStateUpdate = false;
    }

    if (typeof skipStateUpdate === 'function') {
      callback = skipStateUpdate;
      skipStateUpdate = false;
    }

    if (!this.id) {
      Helpers.makeAnError(new Error('Cannot accept an unsent offer'), callback);
      return;
    }

    if (this.state != ETradeOfferState.Active) {
      Helpers.makeAnError(
        new Error(`Offer #${this.id} is not active, so it may not be accepted`),
        callback,
      );
      return;
    }

    if (this.isOurOffer) {
      Helpers.makeAnError(
        new Error(`Cannot accept our own offer #${this.id}`),
        callback,
      );
      return;
    }

    this.manager._community.httpRequestPost(
      `https://steamcommunity.com/tradeoffer/${this.id}/accept`,
      {
        headers: {
          Referer: `https://steamcommunity.com/tradeoffer/${this.id}/`,
        },
        json: true,
        form: {
          sessionid: this.manager._community.getSessionID(),
          serverid: 1,
          tradeofferid: this.id,
          partner: this.partner.toString(),
          captcha: '',
        },
        checkJsonError: false,
        checkHttpError: false,
      },
      (err, response, body) => {
        if (err || response.statusCode != 200) {
          if (response && response.statusCode == 403) {
            this.manager._community._notifySessionExpired(
              new Error('HTTP error 403'),
            );
            Helpers.makeAnError(new Error('Not Logged In'), callback, body);
          } else {
            Helpers.makeAnError(
              err || new Error('HTTP error ' + response.statusCode),
              callback,
              body,
            );
          }

          return;
        }

        if (!body) {
          Helpers.makeAnError(new Error('Malformed JSON response'), callback);
          return;
        }

        if (body && body.strError) {
          Helpers.makeAnError(null, callback, body);
          return;
        }

        this.manager.doPoll();

        if (!callback) {
          return;
        }

        if (skipStateUpdate) {
          if (body.tradeid) {
            this.tradeID = body.tradeid;
          }

          if (body.needs_mobile_confirmation || body.needs_email_confirmation) {
            callback(null, 'pending');
          } else {
            callback(null, 'accepted');
          }
          return;
        }

        this.update(err => {
          if (err) {
            callback(new Error('Cannot load new trade data: ' + err.message));
            return;
          }

          if (
            this.confirmationMethod !== null &&
            this.confirmationMethod != EConfirmationMethod.None
          ) {
            callback(null, 'pending');
          } else if (this.state == ETradeOfferState.InEscrow) {
            callback(null, 'escrow');
          } else if (this.state == ETradeOfferState.Accepted) {
            callback(null, 'accepted');
          } else {
            callback(new Error('Unknown state ' + this.state));
          }
        });
      },
      'tradeoffermanager',
    );
  }

  update(callback) {
    this.manager.getOffer(this.id, (err, offer) => {
      if (err) {
        callback(err);
        return;
      }

      const properties = [
        'id',
        'state',
        'expires',
        'created',
        'updated',
        'escrowEnds',
        'confirmationMethod',
        'tradeID',
      ];

      for (const i in offer) {
        if (
          Object.prototype.hasOwnProperty.call(offer, i) &&
          typeof offer[i] !== 'function' &&
          (properties.indexOf(i) != -1 || this.isGlitched())
        ) {
          this[i] = offer[i];
        }
      }

      callback(null);
    });
  }

  getReceivedItems(getActions, callback) {
    if (typeof getActions === 'function') {
      callback = getActions;
      getActions = false;
    }

    if (!this.id) {
      Helpers.makeAnError(
        new Error('Cannot request received items on an unsent offer'),
        callback,
      );
      return;
    }

    if (this.state != ETradeOfferState.Accepted) {
      Helpers.makeAnError(
        new Error(
          `Offer #${this.id} is not accepted, cannot request received items`,
        ),
        callback,
      );
      return;
    }

    if (!this.tradeID) {
      Helpers.makeAnError(
        new Error(
          `Offer #${this.id} is accepted, but does not have a trade ID`,
        ),
        callback,
      );
      return;
    }

    this.manager._community.httpRequestGet(
      `https://steamcommunity.com/trade/${this.tradeID}/receipt/`,
      (err, response, body) => {
        if (err || response.statusCode != 200) {
          Helpers.makeAnError(
            err || new Error('HTTP error ' + response.statusCode),
            callback,
          );
          return;
        }

        const match = body.match(/<div id="error_msg">\s*([^<]+)\s*<\/div>/);
        if (match) {
          Helpers.makeAnError(new Error(match[1].trim()), callback);
          return;
        }

        const script = body.match(/(var oItem;[\s\S]*)<\/script>/);
        if (!script) {
          if (body.length < 100 && body.match(/\{"success": ?false}/)) {
            Helpers.makeAnError(new Error('Not Logged In'), callback);
            return;
          }

          Helpers.makeAnError(new Error('Malformed response'), callback);
          return;
        }

        const items = [];
        require('vm').runInNewContext(script[1], {
          UserYou: null,
          BuildHover: function (str, item) {
            items.push(item);
          },
          $: function () {
            return { show: function () {} };
          },
        });

        if (items.length == 0 && this.itemsToReceive.length > 0) {
          Helpers.makeAnError(
            new Error('Data temporarily unavailable; try again later'),
            callback,
          );
          return;
        }

        if (!getActions) {
          callback(null, Helpers.processItems(items));
        } else {
          this.manager._addDescriptions(items, (err, describedItems) => {
            if (err) {
              callback(null, Helpers.processItems(items));
            } else {
              callback(null, describedItems);
            }
          });
        }
      },
      'tradeoffermanager',
    );
  }

  getExchangeDetails(getDetailsIfFailed, callback) {
    if (typeof getDetailsIfFailed === 'function') {
      callback = getDetailsIfFailed;
      getDetailsIfFailed = false;
    }

    if (!this.id) {
      Helpers.makeAnError(
        new Error('Cannot get trade details for an unsent trade offer'),
        callback,
      );
      return;
    }

    if (!this.tradeID) {
      Helpers.makeAnError(
        new Error('No trade ID; unable to get trade details'),
        callback,
      );
      return;
    }

    const offer = this;
    offer.manager._apiCall(
      'GET',
      'GetTradeStatus',
      1,
      { tradeid: offer.tradeID },
      (err, result) => {
        if (err) {
          Helpers.makeAnError(err, callback);
          return;
        }

        if (!result.response || !result.response.trades) {
          Helpers.makeAnError(new Error('Malformed response'), callback);
          return;
        }

        const trade = result.response.trades[0];
        if (!trade || trade.tradeid != offer.tradeID) {
          Helpers.makeAnError(
            new Error(
              'Trade not found in GetTradeStatus response; try again later',
            ),
            callback,
          );
          return;
        }

        if (
          !getDetailsIfFailed &&
          [
            ETradeStatus.Complete,
            ETradeStatus.InEscrow,
            ETradeStatus.EscrowRollback,
          ].indexOf(trade.status) === -1
        ) {
          Helpers.makeAnError(
            new Error(
              'Trade status is ' + (ETradeStatus[trade.status] || trade.status),
            ),
            callback,
          );
          return;
        }

        if (!offer.manager._language) {
          callback(
            null,
            trade.status,
            new Date(trade.time_init * 1000),
            trade.assets_received || [],
            trade.assets_given || [],
          );
        } else {
          offer.manager._requestDescriptions(
            (trade.assets_received || []).concat(trade.assets_given || []),
            err => {
              if (err) {
                callback(err);
                return;
              }

              const received = offer.manager._mapItemsToDescriptions(
                null,
                null,
                trade.assets_received || [],
              );
              const given = offer.manager._mapItemsToDescriptions(
                null,
                null,
                trade.assets_given || [],
              );
              callback(
                null,
                trade.status,
                new Date(trade.time_init * 1000),
                received,
                given,
              );
            },
          );
        }
      },
    );
  }

  getUserDetails(callback) {
    if (this.id && this.isOurOffer) {
      Helpers.makeAnError(
        new Error('Cannot get user details for an offer that we sent.'),
        callback,
      );
      return;
    }

    if (this.id && this.state != ETradeOfferState.Active) {
      Helpers.makeAnError(
        new Error(
          'Cannot get user details for an offer that is sent and not Active.',
        ),
        callback,
      );
      return;
    }

    let url;
    if (this.id) {
      url = `https://steamcommunity.com/tradeoffer/${this.id}/`;
    } else {
      url = `https://steamcommunity.com/tradeoffer/new/?partner=${this.partner.accountid}`;
      if (this._token) {
        url += '&token=' + this._token;
      }
    }

    this.manager._community.httpRequestGet(url, (err, response, body) => {
      if (err || response.statusCode != 200) {
        Helpers.makeAnError(
          err || new Error('HTTP error ' + response.statusCode),
          callback,
        );
        return;
      }

      let script = body.match(
        /\n\W*<script type="text\/javascript">\W*\r?\n?(\W*var g_rgAppContextData[\s\S]*)<\/script>/,
      );
      if (!script) {
        Helpers.makeAnError(new Error('Malformed response'), callback);
        return;
      }

      script = script[1];
      const pos = script.indexOf('</script>');
      if (pos != -1) {
        script = script.substring(0, pos);
      }

      const vmContext = require('vm').createContext({
        UserYou: {
          SetProfileURL: function () {},
          SetSteamId: function () {},
        },
        UserThem: {
          SetProfileURL: function () {},
          SetSteamId: function () {},
        },
        $J: function () {},
      });

      require('vm').runInContext(script, vmContext);

      const me = {
        personaName: vmContext.g_strYourPersonaName,
        contexts: vmContext.g_rgAppContextData,
      };

      const them = {
        personaName: vmContext.g_strTradePartnerPersonaName,
        contexts: vmContext.g_rgPartnerAppContextData,
        probation: vmContext.g_bTradePartnerProbation,
      };

      const myEscrow = body.match(/var g_daysMyEscrow = (\d+);/);
      const theirEscrow = body.match(/var g_daysTheirEscrow = (\d+);/);
      if (myEscrow && theirEscrow) {
        me.escrowDays = parseInt(myEscrow[1], 10);
        them.escrowDays = parseInt(theirEscrow[1], 10);
      }

      const myAvatar = body.match(
        new RegExp(
          '<img src="([^"]+)"( alt="[^"]*")? data-miniprofile="' +
            this.manager.steamID.accountid +
            '">',
        ),
      );
      const theirAvatar = body.match(
        new RegExp(
          '<img src="([^"]+)"( alt="[^"]*")? data-miniprofile="' +
            this.partner.accountid +
            '">',
        ),
      );
      if (myAvatar) {
        me.avatarIcon = myAvatar[1];
        me.avatarMedium = myAvatar[1].replace('.jpg', '_medium.jpg');
        me.avatarFull = myAvatar[1].replace('.jpg', '_full.jpg');
      }

      if (theirAvatar) {
        them.avatarIcon = theirAvatar[1];
        them.avatarMedium = theirAvatar[1].replace('.jpg', '_medium.jpg');
        them.avatarFull = theirAvatar[1].replace('.jpg', '_full.jpg');
      }

      callback(null, me, them);
    });
  }

  counter() {
    if (this.state != ETradeOfferState.Active) {
      throw new Error('Cannot counter a non-active offer.');
    }

    const offer = this.duplicate();
    offer._countering = this.id;
    return offer;
  }

  duplicate() {
    const offer = new TradeOffer(this.manager, this.partner, this._token);
    offer.itemsToGive = this.itemsToGive.slice();
    offer.itemsToReceive = this.itemsToReceive.slice();
    offer.isOurOffer = true;
    offer.fromRealTimeTrade = false;
    return offer;
  }

  setMessage(message) {
    if (this.id) {
      throw new Error('Cannot set message in an already-sent offer');
    }

    this.message = message.toString().substring(0, 128);
  }

  setToken(token) {
    if (this.id) {
      throw new Error('Cannot set token in an already-sent offer');
    }

    this._token = token;
  }
}

function addItem(details, offer, list) {
  if (offer.id) {
    throw new Error('Cannot add items to an already-sent offer');
  }

  if (
    typeof details.appid === 'undefined' ||
    typeof details.contextid === 'undefined' ||
    (typeof details.assetid === 'undefined' &&
      typeof details.id === 'undefined')
  ) {
    throw new Error('Missing appid, contextid, or assetid parameter');
  }

  const item = {
    id: (details.id || details.assetid).toString(),
    assetid: (details.assetid || details.id).toString(),
    appid: parseInt(details.appid, 10),
    contextid: details.contextid.toString(),
    amount: parseInt(details.amount || 1, 10),
  };

  if (list.some(tradeItem => Helpers.itemEquals(tradeItem, item))) {
    return false;
  }

  list.push(item);
  return true;
}

module.exports = TradeOffer;
