'use strict';

const Async = require('async');
const FileManager = require('file-manager');
const { LeastUsedCache } = require('@doctormckay/stdlib').DataStructures;
const SteamCommunity = require('steamcommunity');
const SteamID = require('steamid');
const Zlib = require('zlib');
const deepEqual = require('fast-deep-equal');
const { URL } = require('url');
const EventEmitter = require('events');

const Helpers = require('./helpers.js');
const EResult = require('./resources/EResult.js');
const ETradeStatus = require('./resources/ETradeStatus.js');
const EOfferFilter = require('./resources/EOfferFilter.js');
const ETradeOfferState = require('./resources/ETradeOfferState.js');
const EConfirmationMethod = require('./resources/EConfirmationMethod.js');
const TradeOffer = require('./classes/TradeOffer.js');
const EconItem = require('./classes/EconItem.js');

const ITEMS_PER_CLASSINFO_REQUEST = 100;

/**
 * @typedef {object} OptionsObject
 * @property {SteamUser} [steam]
 * @property {SteamCommunity} [community]
 * @property {string} [domain]
 * @property {string} [language]
 * @property {number} [pollInterval=30000]
 * @property {number} [minimumPollInterval=1000]
 * @property {number} [pollFullUpdateInterval=120000]
 * @property {number} [cancelTime]
 * @property {number} [pendingCancelTime]
 * @property {number} [cancelOfferCount]
 * @property {number} [cancelOfferCountMinAge]
 * @property {boolean} [globalAssetCache=false]
 * @property {number} [assetCacheMaxItems=500]
 * @property {number} [assetCacheGcInterval=120000]
 * @property {object} [pollData]
 * @property {string} [dataDirectory]
 * @property {boolean} [gzipData=false]
 * @property {boolean} [savePollData=false]
 * @property {boolean} [useAccessToken=false]
 */

/**
 * @param {OptionsObject} [options]
 * @constructor
 */
class TradeOfferManager extends EventEmitter {
  constructor(options) {
    super();

    options = options || {};

    this._steam = options.steam;
    this._domain = options.domain || 'localhost';
    this._language = options.language;

    this._community = options.community || new SteamCommunity();
    this._pollTimer = null;
    this._lastPoll = 0;
    this._lastPollFullUpdate = 0;
    this._pendingOfferSendResponses = 0;
    this._dataGzip = options.gzipData;

    const assetCacheSize = options.assetCacheMaxItems || 500;
    const assetCacheGcInterval = options.assetCacheGcInterval || 120000;

    if (options.globalAssetCache) {
      global._steamTradeOfferManagerAssetCache =
        global._steamTradeOfferManagerAssetCache ||
        new LeastUsedCache(assetCacheSize, assetCacheGcInterval);
      this._assetCache = global._steamTradeOfferManagerAssetCache;
    } else {
      this._assetCache = new LeastUsedCache(
        assetCacheSize,
        assetCacheGcInterval,
      );
    }

    if (options.dataDirectory) {
      this.storage = new FileManager(options.dataDirectory);
    }

    this.pollInterval = options.pollInterval || 30000;
    this.minimumPollInterval = options.minimumPollInterval || 1000;
    this.pollFullUpdateInterval = options.pollFullUpdateInterval || 120000;
    this.cancelTime = options.cancelTime;
    this.pendingCancelTime = options.pendingCancelTime;
    this.cancelOfferCount = options.cancelOfferCount;
    this.cancelOfferCountMinAge = options.cancelOfferCountMinAge || 0;

    const sanityChecks = {
      pollInterval: 1000,
      minimumPollInterval: 1000,
      pollFullUpdateInterval: 1000,
    };

    for (const i in sanityChecks) {
      const sanityValue = sanityChecks[i];
      const actualValue = this[i];
      if (i == 'pollInterval' && actualValue < 0) {
        continue;
      }

      if (actualValue < sanityValue) {
        this._warn(
          `Option ${i} failed sanity check: provided value (${actualValue}) is too low. ${i} has been forced to ${sanityValue}.`,
        );
        this[i] = sanityValue;
      }
    }

    this.pollData = options.pollData || {};
    this.useAccessToken = options.useAccessToken;
    this.accessToken = null;
    this.apiKey = null;
    this.steamID = null;

    if (this._language) {
      if (this._language == 'szh') {
        this._language = 'zh';
        this._languageName = 'schinese';
      } else if (this._language == 'tzh') {
        this._language = 'zh';
        this._languageName = 'tchinese';
      } else if (this._language == 'br') {
        this._language = 'pt-BR';
        this._languageName = 'brazilian';
      } else {
        const lang = require('languages').getLanguageInfo(this._language);
        if (!lang.name) {
          this._language = null;
          this._languageName = null;
        } else {
          this._languageName = lang.name.toLowerCase();
        }
      }
    }

    if (this._steam) {
      this._steam.on('tradeOffers', () => {
        this.doPoll();
      });

      this._steam.on('newItems', () => {
        this.doPoll();
      });
    }

    if (options.savePollData) {
      this._getPollDataFromDisk = true;
      this.on('pollData', pollData => {
        if (this.steamID) {
          this._persistToDisk(
            'polldata_' + this.steamID + '.json',
            JSON.stringify(pollData),
          );
        }
      });
    }
  }

  setCookies(cookies, familyViewPin, callback) {
    if (typeof familyViewPin === 'function') {
      callback = familyViewPin;
      familyViewPin = null;
    }

    try {
      const loginSecureCookie = cookies.find(
        cookie => cookie.indexOf('steamLoginSecure=') === 0,
      );
      if (!loginSecureCookie) {
        throw new Error('steamLoginSecure cookie not found');
      }

      const cookieValueMatch = loginSecureCookie.match(
        /steamLoginSecure=([^;]+)/,
      );
      if (!cookieValueMatch) {
        throw new Error('steamLoginSecure cookie is malformed');
      }

      const cookieValue = decodeURIComponent(cookieValueMatch[1].trim());
      const accessToken = cookieValue.split('||')[1];
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      this.accessToken = accessToken;
    } catch (ex) {
      if (this.useAccessToken) {
        callback && callback(ex);
        return;
      }
    }

    this._community.setCookies(cookies);
    this.steamID = this._community.steamID;

    if (this._getPollDataFromDisk) {
      delete this._getPollDataFromDisk;
      const filename = 'polldata_' + this.steamID + '.json';
      this._getFromDisk([filename], (_err, files) => {
        if (files[filename]) {
          try {
            this.pollData = JSON.parse(files[filename].toString('utf8'));
          } catch (ex) {
            this.emit(
              'debug',
              'Error parsing poll data from disk: ' + ex.message,
            );
          }
        }
      });
    }

    const finish = err => {
      let hadError = !!err;
      if (hadError) {
        if (
          err.message == 'No API key created for this account' &&
          this.accessToken
        ) {
          hadError = false;

          if (!this.useAccessToken) {
            this._warn(
              'An API key has not been created for this account; access token will be used instead for API requests.' +
                '\n    To disable this warning, create an API key or set useAccessToken to true in TradeOfferManager options.',
            );
          }
        }
      }

      if (hadError) {
        callback && callback(err);
        return;
      }

      if (this._languageName) {
        this._community.setCookies(['Steam_Language=' + this._languageName]);
      }

      clearTimeout(this._pollTimer);
      this.doPoll();

      callback && callback();
    };

    if (familyViewPin) {
      this.parentalUnlock(familyViewPin, err => {
        if (err) {
          callback && callback(err);
          return;
        }

        if (this.accessToken && this.useAccessToken) {
          finish();
        } else {
          this._checkApiKey(finish);
        }
      });
    } else {
      if (this.accessToken && this.useAccessToken) {
        finish();
      } else {
        this._checkApiKey(finish);
      }
    }
  }

  shutdown() {
    clearTimeout(this._pollTimer);
    this._community = new SteamCommunity();
    this._steam = null;
    this.apiKey = null;
    this.accessToken = null;
  }

  parentalUnlock(pin, callback) {
    this._community.parentalUnlock(pin, err => {
      if (callback) {
        callback(err || null);
      }
    });
  }

  _checkApiKey(callback) {
    if (this.apiKey) {
      if (callback) {
        callback();
      }

      return;
    }

    this._community.getWebApiKey(this._domain, (err, key) => {
      if (err) {
        callback(err);
        return;
      }

      this.apiKey = key;
      callback();
    });
  }

  _persistToDisk(filename, content) {
    if (!this.storage) {
      return;
    }

    if (typeof content === 'string') {
      content = Buffer.from(content, 'utf8');
    }

    if (this._dataGzip) {
      Zlib.gzip(content, (err, data) => {
        if (err) {
          this.emit('debug', `Cannot gzip ${filename}: ${err.message}`);
        } else {
          this.storage.writeFile(filename + '.gz', data, err => {
            if (err) {
              this.emit('debug', `Cannot write ${filename}.gz: ${err.message}`);
            }
          });
        }
      });
    } else {
      this.storage.writeFile(filename, content, err => {
        if (err) {
          this.emit('debug', `Cannot write ${filename}: ${err.message}`);
        }
      });
    }
  }

  _getFromDisk(filenames, callback) {
    if (!this.storage) {
      callback(null, {});
      return;
    }

    if (this._dataGzip) {
      filenames = filenames.map(name => name + '.gz');
    }

    this.storage.readFiles(filenames, (_err, results) => {
      const files = {};
      results.forEach(file => {
        if (file.contents) {
          files[file.filename] = file.contents;
        }
      });

      if (this._dataGzip) {
        Async.mapValues(
          files,
          (content, filename, callback) => {
            Zlib.gunzip(content, (err, data) => {
              if (err) {
                callback(null, null);
              } else {
                callback(null, data);
              }
            });
          },
          (_err, files) => {
            const renamed = {};
            for (const i in files) {
              if (Object.prototype.hasOwnProperty.call(files, i)) {
                renamed[i.replace(/\.gz$/, '')] = files[i];
              }
            }

            callback(null, renamed);
          },
        );
      } else {
        callback(null, files);
      }
    });
  }

  /**
   * Get the token parameter from your account's Trade URL
   * @param {function} callback
   */
  getOfferToken(callback) {
    this._community.getTradeURL((err, url, token) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, token);
    });
  }

  getOffersContainingItems(items, includeInactive, callback) {
    if (typeof includeInactive === 'function') {
      callback = includeInactive;
      includeInactive = false;
    }

    if (typeof items.length === 'undefined') {
      items = [items];
    }

    this.getOffers(
      includeInactive ? EOfferFilter.All : EOfferFilter.ActiveOnly,
      (err, sent, received) => {
        if (err) {
          callback(err);
          return;
        }

        callback(null, sent.filter(filterFunc), received.filter(filterFunc));
      },
    );

    function filterFunc(offer) {
      return items.some(item => offer.containsItem(item));
    }
  }

  /**
   * Create a new TradeOffer object.
   * @param {string|SteamID} partner - Their full Trade URL or their SteamID (as a SteamID object or a string that can parse into one)
   * @param {string} [token] - Their trade token, if you aren't friends with them
   * @returns {TradeOffer}
   */
  createOffer(partner, token) {
    if (typeof partner === 'string' && partner.match(/^https?:\/\//)) {
      const url = new URL(partner);
      if (!url.searchParams.get('partner')) {
        throw new Error('Invalid trade URL');
      }

      partner = SteamID.fromIndividualAccountID(
        url.searchParams.get('partner'),
      );
      token = url.searchParams.get('token');
    }

    const offer = new TradeOffer(this, partner, token);
    offer.isOurOffer = true;
    offer.fromRealTimeTrade = false;
    return offer;
  }

  /**
   * Get a trade offer that is already sent (either by you or to you)
   * @param {int|string} id - The offer's numeric ID
   * @param {function} callback
   */
  getOffer(id, callback) {
    this._apiCall(
      'GET',
      'GetTradeOffer',
      1,
      { tradeofferid: id },
      (err, body) => {
        if (err) {
          callback(err);
          return;
        }

        if (!body.response) {
          callback(new Error('Malformed API response'));
          return;
        }

        if (!body.response.offer) {
          callback(new Error('No matching offer found'));
          return;
        }

        if (Helpers.offerMalformed(body.response.offer)) {
          callback(new Error('Data temporarily unavailable'));
          return;
        }

        this._digestDescriptions(body.response.descriptions);
        Helpers.checkNeededDescriptions(this, [body.response.offer], err => {
          if (err) {
            callback(err);
            return;
          }

          callback(
            null,
            Helpers.createOfferFromData(this, body.response.offer),
          );
        });
      },
    );
  }

  /**
   * Get a list of trade offers either sent to you or by you
   * @param {int} filter
   * @param {Date} [historicalCutoff] - Pass a Date object in the past along with ActiveOnly to also get offers that were updated since this time
   * @param {function} callback
   */
  getOffers(filter, historicalCutoff, callback) {
    if (
      [
        EOfferFilter.ActiveOnly,
        EOfferFilter.HistoricalOnly,
        EOfferFilter.All,
      ].indexOf(filter) == -1
    ) {
      throw new Error(
        'Unexpected value "' +
          filter +
          '" for "filter" parameter. Expected a value from the EOfferFilter enum.',
      );
    }

    if (typeof historicalCutoff === 'function') {
      callback = historicalCutoff;
      historicalCutoff = new Date(Date.now() + 31536000000);
    } else if (!historicalCutoff) {
      historicalCutoff = new Date(Date.now() + 31536000000);
    }

    const options = {
      get_descriptions: 0,
      language: this._language,
      active_only: filter == EOfferFilter.ActiveOnly ? 1 : 0,
      historical_only: filter == EOfferFilter.HistoricalOnly ? 1 : 0,
      time_historical_cutoff: Math.floor(historicalCutoff.getTime() / 1000),
      cursor: 0,
    };

    this._fetchOffers(
      {
        get_sent_offers: 1,
        get_received_offers: 0,
        ...options,
      },
      (err, sentOffers) => {
        if (err) {
          callback(err);
          return;
        }

        this._fetchOffers(
          {
            get_sent_offers: 0,
            get_received_offers: 1,
            ...options,
          },
          (err, _, receivedOffers) => {
            if (err) {
              callback(err);
              return;
            }

            Helpers.checkNeededDescriptions(
              this,
              sentOffers.concat(receivedOffers),
              err => {
                if (err) {
                  callback(new Error('Descriptions: ' + err.message));
                  return;
                }

                const sent = sentOffers.map(data =>
                  Helpers.createOfferFromData(this, data),
                );
                const received = receivedOffers.map(data =>
                  Helpers.createOfferFromData(this, data),
                );

                callback(null, sent, received);
                this.emit('offerList', filter, sent, received);
              },
            );
          },
        );
      },
    );
  }

  _fetchOffers(options, callback) {
    let sentOffers = [];
    let receivedOffers = [];

    const request = () => {
      this._apiCall('GET', 'GetTradeOffers', 1, options, (err, body) => {
        if (err) {
          callback(err);
          return;
        }

        if (!body.response) {
          callback(new Error('Malformed API response'));
          return;
        }

        const allOffers = (body.response.trade_offers_sent || []).concat(
          body.response.trade_offers_received || [],
        );
        if (
          allOffers.length > 0 &&
          (allOffers.every(Helpers.offerMalformed) ||
            allOffers.some(Helpers.offerSuperMalformed))
        ) {
          callback(new Error('Data temporarily unavailable'));
          return;
        }

        sentOffers = sentOffers.concat(body.response.trade_offers_sent || []);
        receivedOffers = receivedOffers.concat(
          body.response.trade_offers_received || [],
        );

        options.cursor = body.response.next_cursor || 0;
        if (typeof options.cursor == 'number' && options.cursor != 0) {
          this.emit('debug', 'GetTradeOffers with cursor ' + options.cursor);
          request();
        } else {
          callback(null, sentOffers, receivedOffers);
        }
      });
    };

    request();
  }

  _notifySessionExpired(err) {
    this.emit('sessionExpired', err);
    this._community._notifySessionExpired(err);
  }

  _warn(msg) {
    process.emitWarning(msg, 'Warning', 'steam-tradeoffer-manager');
  }

  _apiCall(httpMethod, method, version, input, callback) {
    if (!this.apiKey && !this.accessToken) {
      callback(
        new Error(
          'API key or access token is not set yet. Call setCookies() first.',
        ),
      );
      return;
    }

    let iface = 'IEconService';
    if (typeof method === 'object') {
      iface = method.iface;
      method = method.method;
    }

    const options = {
      uri: `https://api.steampowered.com/${iface}/${method}/v${version}/`,
      json: true,
      method: httpMethod,
      gzip: true,
    };

    input = input || {};

    if (this.apiKey && !this.useAccessToken) {
      input.key = this.apiKey;
    } else {
      input.access_token = this.accessToken;
    }

    options[httpMethod == 'GET' ? 'qs' : 'form'] = input;

    this._community.httpRequest(
      options,
      (err, response, body) => {
        let error = err;

        if (response && response.statusCode != 200 && !error) {
          error = new Error('HTTP error ' + response.statusCode);
        }

        if (error) {
          error.body = body;

          if (
            response &&
            typeof response.body === 'string' &&
            response.body.indexOf('Access is denied') >= 0
          ) {
            this._notifySessionExpired(error);
          }

          callback(error);
          return;
        }

        let eresult = response.headers['x-eresult'];
        if (
          eresult == 2 &&
          body &&
          (Object.keys(body).length > 1 ||
            (body.response && Object.keys(body.response).length > 0))
        ) {
          eresult = 1;
        }

        if (typeof eresult !== 'undefined' && eresult != 1) {
          error = new Error(EResult[eresult] || eresult);
          error.eresult = eresult;
          error.body = body;
          callback(error);
          return;
        }

        if (!body || typeof body !== 'object') {
          error = new Error('Invalid API response');
          error.body = body;
          callback(error);
          return;
        }

        callback(null, body);
      },
      'tradeoffermanager',
    );
  }

  _digestDescriptions(descriptions) {
    const cache = this._assetCache;

    if (!this._language) {
      return;
    }

    if (descriptions && !(descriptions instanceof Array)) {
      descriptions = Object.keys(descriptions).map(key => descriptions[key]);
    }

    (descriptions || []).forEach(item => {
      if (!item || !item.appid || !item.classid) {
        return;
      }

      cache.add(
        `${item.appid}_${item.classid}_${item.instanceid || '0'}`,
        item,
      );
      this._persistToDisk(
        `asset_${item.appid}_${item.classid}_${item.instanceid || '0'}.json`,
        JSON.stringify(item),
      );
    });
  }

  _mapItemsToDescriptions(appid, contextid, items) {
    const cache = this._assetCache;

    if (!(items instanceof Array)) {
      items = Object.keys(items).map(key => items[key]);
    }

    return items.map(item => {
      item.appid = appid || item.appid;
      item.contextid = contextid || item.contextid;

      const key = `${item.appid}_${item.classid}_${item.instanceid || '0'}`;
      const entry = cache.get(key);
      if (!entry) {
        return new EconItem(item);
      }

      for (const i in entry) {
        if (Object.prototype.hasOwnProperty.call(entry, i)) {
          item[i] = entry[i];
        }
      }

      return new EconItem(item);
    });
  }

  _hasDescription(item, appid) {
    appid = appid || item.appid;
    return !!this._assetCache.get(
      appid + '_' + item.classid + '_' + (item.instanceid || '0'),
    );
  }

  _addDescriptions(items, callback) {
    const descriptionRequired = items.filter(
      item => !this._hasDescription(item),
    );

    if (descriptionRequired.length == 0) {
      callback(null, this._mapItemsToDescriptions(null, null, items));
      return;
    }

    this._requestDescriptions(descriptionRequired, err => {
      if (err) {
        callback(err);
      } else {
        callback(null, this._mapItemsToDescriptions(null, null, items));
      }
    });
  }

  _requestDescriptions(classes, callback) {
    const getFromSteam = () => {
      const apps = [];
      const appids = [];

      classes.forEach(item => {
        if (
          this._assetCache.get(
            `${item.appid}_${item.classid}_${item.instanceid || '0'}`,
          )
        ) {
          return;
        }

        let index = appids.indexOf(item.appid);
        if (index == -1) {
          index = appids.push(item.appid) - 1;
          const arr = [];
          arr.appid = item.appid;
          apps.push(arr);
        }

        if (
          apps[index].indexOf(item.classid + '_' + (item.instanceid || '0')) ==
          -1
        ) {
          apps[index].push(item.classid + '_' + (item.instanceid || '0'));
        }
      });

      Async.map(
        apps,
        (app, cb) => {
          const chunks = [];
          let items = [];

          while (app.length > 0) {
            chunks.push(app.splice(0, ITEMS_PER_CLASSINFO_REQUEST));
          }

          Async.each(
            chunks,
            (chunk, chunkCb) => {
              const input = {
                appid: app.appid,
                language: this._language,
                class_count: chunk.length,
              };

              chunk.forEach((item, index) => {
                const parts = item.split('_');
                input['classid' + index] = parts[0];
                input['instanceid' + index] = parts[1];
              });

              this.emit(
                'debug',
                'Requesting classinfo for ' +
                  chunk.length +
                  ' items from app ' +
                  app.appid,
              );
              this._apiCall(
                'GET',
                {
                  iface: 'ISteamEconomy',
                  method: 'GetAssetClassInfo',
                },
                1,
                input,
                (err, body) => {
                  if (err) {
                    chunkCb(err);
                    return;
                  }

                  if (!body.result || !body.result.success) {
                    chunkCb(new Error('Invalid API response'));
                    return;
                  }

                  const chunkItems = Object.keys(body.result)
                    .map(id => {
                      if (!id.match(/^\d+(_\d+)?$/)) {
                        return null;
                      }

                      const item = body.result[id];
                      item.appid = app.appid;
                      return item;
                    })
                    .filter(item => !!item);

                  items = items.concat(chunkItems);

                  chunkCb(null);
                },
              );
            },
            err => {
              if (err) {
                cb(err);
              } else {
                cb(null, items);
              }
            },
          );
        },
        (err, result) => {
          if (err) {
            callback(err);
            return;
          }

          result.forEach(this._digestDescriptions.bind(this));
          callback();
        },
      );
    };

    const filenames = classes.map(
      item =>
        `asset_${item.appid}_${item.classid}_${item.instanceid || '0'}.json`,
    );
    this._getFromDisk(filenames, (err, files) => {
      if (err) {
        getFromSteam();
        return;
      }

      for (const filename in files) {
        if (!Object.prototype.hasOwnProperty.call(files, filename)) {
          continue;
        }

        const match = filename.match(/asset_(\d+_\d+_\d+)\.json/);
        if (!match) {
          this.emit(
            'debug',
            "Shouldn't be possible, but filename " +
              filename +
              " doesn't match regex",
          );
          continue;
        }

        try {
          this._assetCache.add(
            match[1],
            JSON.parse(files[filename].toString('utf8')),
          );
        } catch (ex) {
          this.emit(
            'debug',
            'Error parsing description file ' + filename + ': ' + ex,
          );
        }
      }

      getFromSteam();
    });
  }

  doPoll(doFullUpdate) {
    if (!this.apiKey && !this.accessToken) {
      return;
    }

    const timeSinceLastPoll = Date.now() - this._lastPoll;

    if (timeSinceLastPoll < this.minimumPollInterval) {
      this._resetPollTimer(this.minimumPollInterval - timeSinceLastPoll);
      return;
    }

    this._lastPoll = Date.now();
    clearTimeout(this._pollTimer);

    let offersSince = 0;
    if (this.pollData.offersSince) {
      offersSince = this.pollData.offersSince - 1800;
    }

    let fullUpdate = false;
    if (
      Date.now() - this._lastPollFullUpdate >= this.pollFullUpdateInterval ||
      doFullUpdate
    ) {
      fullUpdate = true;
      this._lastPollFullUpdate = Date.now();
      offersSince = 1;
    }

    this.emit(
      'debug',
      'Doing trade offer poll since ' +
        offersSince +
        (fullUpdate ? ' (full update)' : ''),
    );
    const requestStart = Date.now();
    this.getOffers(
      fullUpdate ? EOfferFilter.All : EOfferFilter.ActiveOnly,
      new Date(offersSince * 1000),
      (err, sent, received) => {
        if (err) {
          this.emit(
            'debug',
            'Error getting trade offers for poll: ' + err.message,
          );
          this.emit('pollFailure', err);
          this._resetPollTimer();
          return;
        }

        this.emit(
          'debug',
          'Trade offer poll succeeded in ' +
            (Date.now() - requestStart) +
            ' ms',
        );

        const origPollData = JSON.parse(JSON.stringify(this.pollData));

        const timestamps = this.pollData.timestamps || {};
        let offers = this.pollData.sent || {};
        let hasGlitchedOffer = false;

        sent.forEach(offer => {
          if (!offers[offer.id]) {
            if (!this._pendingOfferSendResponses) {
              if (offer.fromRealTimeTrade) {
                if (
                  offer.state == ETradeOfferState.CreatedNeedsConfirmation ||
                  (offer.state == ETradeOfferState.Active &&
                    offer.confirmationMethod != EConfirmationMethod.None)
                ) {
                  this.emit('realTimeTradeConfirmationRequired', offer);
                } else if (offer.state == ETradeOfferState.Accepted) {
                  this.emit('realTimeTradeCompleted', offer);
                }
              }

              this.emit('unknownOfferSent', offer);
              offers[offer.id] = offer.state;
              timestamps[offer.id] = offer.created.getTime() / 1000;
            }
          } else if (offer.state != offers[offer.id]) {
            if (!offer.isGlitched()) {
              if (
                offer.fromRealTimeTrade &&
                offer.state == ETradeOfferState.Accepted
              ) {
                this.emit('realTimeTradeCompleted', offer);
              }

              this.emit('sentOfferChanged', offer, offers[offer.id]);
              offers[offer.id] = offer.state;
              timestamps[offer.id] = offer.created.getTime() / 1000;
            } else {
              hasGlitchedOffer = true;
              const countWithoutName = !this._language
                ? 0
                : offer.itemsToGive
                    .concat(offer.itemsToReceive)
                    .filter(function (item) {
                      return !item.name;
                    }).length;
              this.emit(
                'debug',
                'Not emitting sentOfferChanged for ' +
                  offer.id +
                  " right now because it's glitched (" +
                  offer.itemsToGive.length +
                  ' to give, ' +
                  offer.itemsToReceive.length +
                  ' to receive, ' +
                  countWithoutName +
                  ' without name)',
              );
            }
          }

          if (offer.state == ETradeOfferState.Active) {
            let cancelTime = this.cancelTime;

            const customCancelTime = offer.data('cancelTime');
            if (typeof customCancelTime !== 'undefined') {
              cancelTime = customCancelTime;
            }

            if (
              cancelTime &&
              Date.now() - offer.updated.getTime() >= cancelTime
            ) {
              offer.cancel(err => {
                if (!err) {
                  this.emit('sentOfferCanceled', offer, 'cancelTime');
                } else {
                  this.emit(
                    'debug',
                    "Can't auto-cancel offer #" + offer.id + ': ' + err.message,
                  );
                }
              });
            }
          }

          if (
            offer.state == ETradeOfferState.CreatedNeedsConfirmation &&
            this.pendingCancelTime
          ) {
            let pendingCancelTime = this.pendingCancelTime;

            const customPendingCancelTime = offer.data('pendingCancelTime');
            if (typeof customPendingCancelTime !== 'undefined') {
              pendingCancelTime = customPendingCancelTime;
            }

            if (
              pendingCancelTime &&
              Date.now() - offer.created.getTime() >= pendingCancelTime
            ) {
              offer.cancel(err => {
                if (!err) {
                  this.emit('sentPendingOfferCanceled', offer);
                } else {
                  this.emit(
                    'debug',
                    "Can't auto-canceling pending-confirmation offer #" +
                      offer.id +
                      ': ' +
                      err.message,
                  );
                }
              });
            }
          }
        });

        if (this.cancelOfferCount) {
          const sentActive = sent.filter(
            offer => offer.state == ETradeOfferState.Active,
          );

          if (sentActive.length >= this.cancelOfferCount) {
            let oldest = sentActive[0];
            for (let i = 1; i < sentActive.length; i++) {
              if (sentActive[i].updated.getTime() < oldest.updated.getTime()) {
                oldest = sentActive[i];
              }
            }

            if (
              Date.now() - oldest.updated.getTime() >=
              this.cancelOfferCountMinAge
            ) {
              oldest.cancel(err => {
                if (!err) {
                  this.emit('sentOfferCanceled', oldest, 'cancelOfferCount');
                }
              });
            }
          }
        }

        this.pollData.sent = offers;
        offers = this.pollData.received || {};

        received.forEach(offer => {
          if (offer.isGlitched()) {
            hasGlitchedOffer = true;
            return;
          }

          if (offer.fromRealTimeTrade) {
            if (
              !offers[offer.id] &&
              (offer.state == ETradeOfferState.CreatedNeedsConfirmation ||
                (offer.state == ETradeOfferState.Active &&
                  offer.confirmationMethod != EConfirmationMethod.None))
            ) {
              this.emit('realTimeTradeConfirmationRequired', offer);
            } else if (
              offer.state == ETradeOfferState.Accepted &&
              (!offers[offer.id] || offers[offer.id] != offer.state)
            ) {
              this.emit('realTimeTradeCompleted', offer);
            }
          }

          if (!offers[offer.id] && offer.state == ETradeOfferState.Active) {
            this.emit('newOffer', offer);
          } else if (offers[offer.id] && offer.state != offers[offer.id]) {
            this.emit('receivedOfferChanged', offer, offers[offer.id]);
          }

          offers[offer.id] = offer.state;
          timestamps[offer.id] = offer.created.getTime() / 1000;
        });

        this.pollData.received = offers;
        this.pollData.timestamps = timestamps;

        if (!hasGlitchedOffer) {
          let latest = this.pollData.offersSince || 0;
          sent.concat(received).forEach(offer => {
            const updated = Math.floor(offer.updated.getTime() / 1000);
            if (updated > latest) {
              latest = updated;
            }
          });

          this.pollData.offersSince = latest;
        }

        this.emit('pollSuccess');

        if (!deepEqual(origPollData, this.pollData)) {
          this.emit('pollData', this.pollData);
        }

        this._resetPollTimer();
      },
    );
  }

  _resetPollTimer(time) {
    if (this.pollInterval < 0) {
      return;
    }

    if (time || this.pollInterval >= this.minimumPollInterval) {
      clearTimeout(this._pollTimer);
      this._pollTimer = setTimeout(
        this.doPoll.bind(this),
        time || this.pollInterval,
      );
    }
  }
}

TradeOfferManager.SteamID = SteamID;
TradeOfferManager.ETradeOfferState = ETradeOfferState;
TradeOfferManager.EOfferFilter = EOfferFilter;
TradeOfferManager.EResult = EResult;
TradeOfferManager.EConfirmationMethod = EConfirmationMethod;
TradeOfferManager.ETradeStatus = ETradeStatus;

module.exports = TradeOfferManager;
