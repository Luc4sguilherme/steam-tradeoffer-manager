'use strict';

class EconItem {
  constructor(item) {
    for (const thing in item) {
      if (Object.prototype.hasOwnProperty.call(item, thing)) {
        this[thing] = item[thing];
      }
    }

    if (this.id || this.assetid) {
      this.assetid = this.id = (this.id || this.assetid).toString();
    } else if (this.currencyid) {
      this.currencyid = this.currencyid.toString();
    }

    this.appid = this.appid ? parseInt(this.appid, 10) : 0;
    this.classid = this.classid.toString();
    this.instanceid = (this.instanceid || 0).toString();
    this.amount = this.amount ? parseInt(this.amount, 10) : 1;
    this.contextid = this.contextid.toString();

    this.fraudwarnings = fixArray(this.fraudwarnings);
    this.descriptions = fixArray(this.descriptions);
    this.owner_descriptions = fixArray(this.owner_descriptions);
    this.actions = fixArray(this.actions);
    this.owner_actions = fixArray(this.owner_actions);
    this.market_actions = fixArray(this.market_actions);
    this.tags = fixTags(this.tags);

    this.tradable = fixBool(this.tradable);
    this.marketable = fixBool(this.marketable);
    this.commodity = fixBool(this.commodity);
    this.market_tradable_restriction = this.market_tradable_restriction
      ? parseInt(this.market_tradable_restriction, 10)
      : 0;
    this.market_marketable_restriction = this.market_marketable_restriction
      ? parseInt(this.market_marketable_restriction, 10)
      : 0;

    if (this.appid == 753 && !this.market_fee_app && this.market_hash_name) {
      const match = this.market_hash_name.match(/^(\d+)-/);
      if (match) {
        this.market_fee_app = parseInt(match[1], 10);
      }
    }
  }

  getImageURL() {
    return (
      'https://steamcommunity-a.akamaihd.net/economy/image/' +
      this.icon_url +
      '/'
    );
  }

  getLargeImageURL() {
    if (!this.icon_url_large) {
      return this.getImageURL();
    }

    return (
      'https://steamcommunity-a.akamaihd.net/economy/image/' +
      this.icon_url_large +
      '/'
    );
  }

  getTag(category) {
    if (!this.tags) {
      return null;
    }

    for (let i = 0; i < this.tags.length; i++) {
      if (this.tags[i].category == category) {
        return this.tags[i];
      }
    }

    return null;
  }
}

function fixBool(val) {
  return typeof val === 'boolean' ? val : !!parseInt(val, 10);
}

function fixArray(obj) {
  if (typeof obj === 'undefined' || obj == '') {
    return [];
  }

  const array = [];
  for (const i in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, i)) {
      array[i] = obj[i];
    }
  }

  return array;
}

function fixTags(tags) {
  if (!(tags instanceof Array)) {
    tags = fixArray(tags);
  }

  return tags.map(tag => {
    tag.name = tag.localized_tag_name = tag.localized_tag_name || tag.name;
    tag.color = tag.color || '';
    tag.category_name = tag.localized_category_name =
      tag.localized_category_name || tag.category_name;
    return tag;
  });
}

module.exports = EconItem;
