declare module '@luc4sguilherme/steam-tradeoffer-manager' {
  import { EventEmitter } from 'events';
  import SteamCommunity from 'steamcommunity';
  import SteamID from 'steamid';

  const SteamID: SteamID;

  enum EConfirmationMethod {
    None = 0,
    Email = 1,
    MobileApp = 2,
  }

  enum EOfferFilter {
    ActiveOnly = 1,
    HistoricalOnly = 2,
    All = 3,
  }

  enum EResult {
    Invalid = 0,
    OK = 1,
    Fail = 2,
    NoConnection = 3,
    InvalidPassword = 5,
    LoggedInElsewhere = 6,
    InvalidProtocolVer = 7,
    InvalidParam = 8,
    FileNotFound = 9,
    Busy = 10,
    InvalidState = 11,
    InvalidName = 12,
    InvalidEmail = 13,
    DuplicateName = 14,
    AccessDenied = 15,
    Timeout = 16,
    Banned = 17,
    AccountNotFound = 18,
    InvalidSteamID = 19,
    ServiceUnavailable = 20,
    NotLoggedOn = 21,
    Pending = 22,
    EncryptionFailure = 23,
    InsufficientPrivilege = 24,
    LimitExceeded = 25,
    Revoked = 26,
    Expired = 27,
    AlreadyRedeemed = 28,
    DuplicateRequest = 29,
    AlreadyOwned = 30,
    IPNotFound = 31,
    PersistFailed = 32,
    LockingFailed = 33,
    LogonSessionReplaced = 34,
    ConnectFailed = 35,
    HandshakeFailed = 36,
    IOFailure = 37,
    RemoteDisconnect = 38,
    ShoppingCartNotFound = 39,
    Blocked = 40,
    Ignored = 41,
    NoMatch = 42,
    AccountDisabled = 43,
    ServiceReadOnly = 44,
    AccountNotFeatured = 45,
    AdministratorOK = 46,
    ContentVersion = 47,
    TryAnotherCM = 48,
    PasswordRequiredToKickSession = 49,
    AlreadyLoggedInElsewhere = 50,
    Suspended = 51,
    Cancelled = 52,
    DataCorruption = 53,
    DiskFull = 54,
    RemoteCallFailed = 55,
    PasswordUnset = 56,
    ExternalAccountUnlinked = 57,
    PSNTicketInvalid = 58,
    ExternalAccountAlreadyLinked = 59,
    RemoteFileConflict = 60,
    IllegalPassword = 61,
    SameAsPreviousValue = 62,
    AccountLogonDenied = 63,
    CannotUseOldPassword = 64,
    InvalidLoginAuthCode = 65,
    AccountLogonDeniedNoMail = 66,
    HardwareNotCapableOfIPT = 67,
    IPTInitError = 68,
    ParentalControlRestricted = 69,
    FacebookQueryError = 70,
    ExpiredLoginAuthCode = 71,
    IPLoginRestrictionFailed = 72,
    AccountLockedDown = 73,
    AccountLogonDeniedVerifiedEmailRequired = 74,
    NoMatchingURL = 75,
    BadResponse = 76,
    RequirePasswordReEntry = 77,
    ValueOutOfRange = 78,
    UnexpectedError = 79,
    Disabled = 80,
    InvalidCEGSubmission = 81,
    RestrictedDevice = 82,
    RegionLocked = 83,
    RateLimitExceeded = 84,
    AccountLoginDeniedNeedTwoFactor = 85,
    ItemDeleted = 86,
    AccountLoginDeniedThrottle = 87,
    TwoFactorCodeMismatch = 88,
    TwoFactorActivationCodeMismatch = 89,
    AccountAssociatedToMultiplePartners = 90,
    NotModified = 91,
    NoMobileDevice = 92,
    TimeNotSynced = 93,
    SMSCodeFailed = 94,
    AccountLimitExceeded = 95,
    AccountActivityLimitExceeded = 96,
    PhoneActivityLimitExceeded = 97,
    RefundToWallet = 98,
    EmailSendFailure = 99,
    NotSettled = 100,
    NeedCaptcha = 101,
    GSLTDenied = 102,
    GSOwnerDenied = 103,
    InvalidItemType = 104,
    IPBanned = 105,
    GSLTExpired = 106,
    InsufficientFunds = 107,
    TooManyPending = 108,
    NoSiteLicensesFound = 109,
    WGNetworkSendExceeded = 110,
    AccountNotFriends = 111,
    LimitedUserAccount = 112,
  }

  enum ETradeOfferState {
    Invalid = 1,
    Active = 2,
    Accepted = 3,
    Countered = 4,
    Expired = 5,
    Canceled = 6,
    Declined = 7,
    InvalidItems = 8,
    CreatedNeedsConfirmation = 9,
    CanceledBySecondFactor = 10,
    InEscrow = 11,
  }

  enum ETradeStatus {
    Init = 0,
    PreCommitted = 1,
    Committed = 2,
    Complete = 3,
    Failed = 4,
    PartialSupportRollback = 5,
    FullSupportRollback = 6,
    SupportRollback_Selective = 7,
    RollbackFailed = 8,
    RollbackAbandoned = 9,
    InEscrow = 10,
    EscrowRollback = 11,
  }

  interface EventListener {
    /**
     * Emitted when polling detects a new trade offer sent to us. Only emitted if
     *
     * @param offer - A TradeOffer object for the newly-received offer.
     */
    newOffer: (offer: TradeOffer) => void;

    /**
     * Emitted when an offer we sent changes state. This might mean that it was accepted/declined by the other
     * party, that we cancelled it, or that we confirmed a pending offer via email. Only emitted if
     *
     * @param offer - A TradeOffer object for the changed offer.
     * @param oldState - The previous known ETradeOfferState of the offer.
     */
    sentOfferChanged: (offer: TradeOffer, oldState: ETradeOfferState) => void;

    /**
     * Emitted when the manager automatically cancels an offer due to either your `cancelTime` constructor option or
     * your `cancelOfferCount` constructor option. `sentOfferChanged` will also be emitted on next poll.
     *
     * @param offer - A `TradeOffer` object for the canceled offer.
     * @param reason - A string containing the reason why it was canceled.
     *
     *   - `cancelTime` - The `cancelTime` timeout was reached.
     *   - `cancelOfferCount` - The `cancelOfferCount` limit was reached.
     */
    sentOfferCanceled: (offer: TradeOffer, reason: string) => void;

    /**
     * Emitted when the manager automatically cancels an offer due to your `pendingCancelTime` constructor option.
     * `sentOfferChanged` will also be emitted on next poll.
     *
     * @param offer - A `TradeOffer` object for the canceled offer.
     */
    sentPendingOfferCanceled: (offer: TradeOffer) => void;

    /**
     * Emitted when the manager finds a trade offer that was sent by us, but that wasn't sent via
     * `steam-tradeoffer-manager`(i.e. it's not in the poll data, so this will emit for all sent offers on
     * every startup if you don't restore poll data).
     *
     * You could use this to cancel offers that error when you call `send()` but actually go through later, because
     * of how awful Steam is.
     *
     * @param offer - A `TradeOffer` object for the offer that was sent.
     */
    unknownOfferSent: (offer: TradeOffer) => void;

    /**
     * Emitted when an offer we received changes state. This might mean that it was cancelled by the other party, or
     * that we accepted/declined it. Only emitted if
     *
     * @param offer - A `TradeOffer` object for the changed offer.
     * @param oldState - The previous known
     */
    receivedOfferChanged: (
      offer: TradeOffer,
      oldState: ETradeOfferState,
    ) => void;

    /**
     * Emitted when polling reveals that we have a new trade offer that was created from a real-time trade session
     * that requires confirmation. See
     *
     * @param offer - A `TradeOffer` object for the offer that needs to be confirmed.
     */
    realTimeTradeConfirmationRequired: (offer: TradeOffer) => void;

    /**
     * Emitted when polling reveals that a trade offer that was created from a real-time trade is now Accepted,
     * meaning that the trade has completed. See
     *
     * @param offer - A TradeOffer object for the offer that has completed.
     */
    realTimeTradeCompleted: (offer: TradeOffer) => void;

    /**
     * Emitted when there's a problem polling the API. You can use this to alert users that Steam is currently down
     * or acting up, if you wish.
     *
     * @param err - An Error object
     */
    pollFailure: (err: Error) => void;

    /** Emitted when a poll succeeds. */
    pollSuccess: () => void;

    /**
     * Emitted when new poll data is available. See the
     *
     * @param pollData - The new poll data.
     */
    pollData: (pollData: any) => void;

    /**
     * Emitted whenever a `getOffers` call succeeds, regardless of the source of the call. Note that if `filter` is
     * `EOfferFilter.ActiveOnly` then there may have been a historical cutoff provided so there may also be some
     * historical offers present in the output.
     *
     * @param filter - The `EOfferFilter` value that was used to get this list.
     * @param sent - An array of `TradeOffer` objects for offers we sent.
     * @param received - An array of `TradeOffer` objects for offers we received.
     */
    offerList: (
      filter: EOfferFilter,
      sent: TradeOffer[],
      received: TradeOffer[],
    ) => void;
  }

  interface Options {
    /**
     * See
     */
    steam?: any;

    /**
     * to use. If not provided, one will be created internally automatically.
     */
    community?: SteamCommunity;

    /**
     * Your domain name, if you have one. Used to register a
     */
    domain?: string;

    /**
     * Pass true here to use an access token rather than an API key to access the WebAPI.
     */
    useAccessToken?: boolean;

    /**
     * Specify a language code if you want item descriptions. Must be a 2-character language code like `en` or `es`.
     *
     * Note: For Chinese, use `tzh` for Traditional Chinese, and `szh` for Simplified Chinese.
     */
    language?: string;

    /**
     * The time, in milliseconds, between
     * polling is disabled.
     *
     * Minimum `1000`, default `30000` (30 seconds).
     */
    pollInterval?: number;

    /**
     *
     * Minimum `1000`, default `1000` (1 second).
     */
    minimumPollInterval?: number;

    /**
     * When a poll is triggered, TradeOfferManager ordinarily requests only trade offers that have been updated since the last poll.
     * However, TradeOfferManager occasionally runs "full updates" where it requests all recent trade offers for the account, to ensure that nothing is missed.
     * This option controls the interval (in milliseconds) at which full updates are run.
     *
     * Minimum `1000`, default `120000 ` (120 seconds / 2 minutes).
     */
    pollFullUpdateInterval?: number;

    /**
     * The time, in milliseconds, that a sent offer can remain Active until it's automatically canceled by the
     * manager. This feature is disabled if omitted.
     *
     * Note that this check is performed on
     * work as expected if timed polling is enabled. Also note that because polling is on a timer, offers will be
     * canceled between `cancelTime` and `cancelTime + pollInterval` milliseconds after being created, assuming Steam is up.
     */
    cancelTime?: number;

    /**
     * The time, in milliseconds, that a sent offer can remain CreatedNeedsConfirmation until it's automatically
     * canceled by the manager. This feature is disabled if omitted. All documentation for `cancelTime` applies.
     */
    pendingCancelTime?: number;

    /** Once we have this many outgoing Active offers, the oldest will be automatically canceled. */
    cancelOfferCount?: number;

    /**
     * If you're using `cancelOfferCount`, then offers must be at least this many milliseconds old in order to
     * qualify for automatic cancellation.
     */
    cancelOfferCountMinAge?: number;

    /**
     * If this is `true` and you specified a `language`, then descriptions which are obtained from the WebAPI are
     * stored in the `global` object instead of in a property of `TradeOfferManager`. As a result, all
     * `TradeOfferManager` objects running within the application will share the same description cache (can reduce
     * memory usage).
     *
     * Default `false`.
     */
    globalAssetCache?: boolean;

    /**
     * The maximum number of asset descriptions that will be stored in memory. If you specify a `dataDirectory`,
     * then excess asset descriptions will be persisted to the local disk (or to whatever
     * If not, then once asset descriptions are purged from memory they will need to be
     * re-retrieved from Steam the next time they are needed, which could significantly increase your Steam API requests.
     *
     * Has no effect if you don't specify a language. Lowering this number will negatively affect performance but
     * will reduce memory usage.
     *
     * Default `500`.
     */
    assetCacheMaxItems?: number;

    /**
     * The time in milliseconds between when the asset cache will attempt to purge items from the asset cache, which
     * is an `O(n log n)` operation.
     *
     * Default `120000` (2 minutes).
     */
    assetCacheGcInterval?: number;

    /**
     * If passed, this will be assigned to
     */
    pollData?: string;

    /**
     * Controls where the asset cache and poll data (if `savePollData` is enabled) are saved.
     *
     * Defaults to a platform-specific directory
     * You can set this to null to disable all data persistence to disk.
     */
    dataDirectory?: string | null;

    /**
     * Set this to `true` if you want data that's persisted to `dataDirectory` to first be gzipped (default off, and
     * probably doesn't need to be on as the files are typically very small and gzip won't do much)
     */
    gzipData?: boolean;

    /**
     * Set this to `true` if you want the module's poll data to be saved to disk automatically (requires
     * `dataDirectory` to not be null) and retrieved on startup.
     */
    savePollData?: boolean;
  }

  interface Tag {
    internal_name: string;
    name: string;
    category: string;
    color: string;
    category_name: string;
    localized_tag_name: string;
    localized_category_name: string;
  }

  interface UserData {
    /** The user's current Steam display name. */
    personName: string;

    /** An object containing the user's inventory contexts. */
    contexts: object;

    /** How many days the trade will be held if completed due to the user. */
    escrowDays: number | null;

    /** `true` if the user is on trade probation, `false` if not. */
    probation?: boolean;

    /** A URL to the icon-sized version of the user's avatar. */
    avatarIcon: string;

    /** A URL to the medium-sized version of the user's avatar. */
    avatarMedium: string;

    /** A URL to the full-sized version of the user's avatar. */
    avatarFull: string;
  }

  interface EconItemDescription {
    type: string;
    value?: string;
    color?: string;
    app_data?: string;
  }

  interface EconItemAction {
    link?: string;
    name?: string;
  }

  interface EconItemTag {
    internal_name: string;
    category: string;
    name?: string;
    localized_tag_name?: string;
    category_name?: string;
    localized_category_name?: string;
    color?: string;
  }

  abstract class TradeOffer {
    constructor(
      manager: TradeOfferManager,
      partner: SteamID | string,
      token?: string,
    );

    /**
     * The `TradeOfferManager` which owns this `TradeOffer`. If you want to get the SteamID of the bot account which
     * sent/received this trade offer, use `offer.manager.steamID`.
     */
    manager: TradeOfferManager;

    /** The trade offer's unique numeric ID, represented as a string. */
    id: string;

    /** The other party in this offer, as a `SteamID` object. */
    partner: SteamID;

    /** A message, possibly empty, included with the trade offer by its sender. */
    message: string;

    /** A value from the `ETradeOfferState` enum. */
    state: ETradeOfferState;

    /**
     * An array of items to be given from your account should this offer be accepted.
     *
     * - If this offer has not yet been sent or was just sent, object in this array will not contain `classid` or
     *   `instanceid` properties, as it would had you loaded a sent offer
     */
    itemsToGive: EconItem[];

    /**
     * An array of items to be given from the other account and received by yours should this offer be accepted.
     *
     * - If this offer has not yet been sent or was just sent, object in this array will not contain `classid` or
     *   `instanceid` properties, as it would had you loaded a sent offer
     */
    itemsToReceive: EconItem[];

    /** `true` if this offer was sent by you, `false` if you received it. */
    isOurOffer: boolean;

    /** A `Date` object representing when the trade offer was sent. */
    created: Date;

    /** A `Date` object representing when the trade offer was last updated (equal to `created` if never updated). */
    updated: Date;

    /** A `Date` object representing when the trade offer will expire if not acted on. */
    expires: Date;

    /**
     * A numeric trade ID, represented as a string, if the offer was accepted. `null` otherwise. This value won't be
     * very useful to you.
     */
    tradeID: string | null;

    /**
     * `true` if this trade offer was created automatically from a real-time trade that was committed.
     *
     * `false` if it was explicitly sent as a trade offer.
     */
    fromRealTimeTrade: boolean;

    /**
     * If this offer needs to be confirmed by you, this is a value from
     */
    confirmationMethod: EConfirmationMethod;

    /** If this offer is in state `InEscrow` (11), this is a `Date` object representing when the offer should exit escrow. */
    escrowEnds: Date | null;

    /** The stringified raw JSON from the WebAPI from which this `TradeOffer` object was constructed. */
    rawJson: string;

    /**
     * Checks if the offer is `glitched`. Returns `true` (glitched) or `false` (not glitched). An offer is
     * considered `glitched` if it has been sent and either contains no items (`itemsToGive` and `itemsToReceive`
     * are both empty) or any item has an empty or undefined `name`. Neither of these conditions can be met under
     * normal, non-buggy Steam conditions.
     */
    isGlitched(): boolean;

    /**
     * @param key - A `string` containing the data key you wish to get/set.
     * @param value - Any arbitrary data type that can be stringified using `JSON.stringify`. Using `undefined` will
     *   unset the value.
     */
    data<T>(key: string, value?: T): T;

    /**
     * Adds a given item to a new trade offer. The item object should be in the same format as is returned by the
     * Steam inventory. That is, it should have the following properties:
     *
     * - `assetid` - The item's asset ID within its context (the property can also be named id).
     * - `appid` - The ID of the app to which the item belongs.
     * - `contextid` - The ID of the context within the app to which the item belongs.
     * - `amount` - Default `1`, if the item is stackable, this is how much of the stack will be added.
     *
     * Returns `true` if the item wasn't already in the offer and so was added successfully, or `false` if it was
     * already in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param item - An item object.
     */
    addMyItem(item: EconItem): boolean;

    /**
     * Adds items to a new trade offer. The item object should be in the same format as is returned by the Steam
     * inventory. That is, it should have the following properties:
     *
     * - `assetid` - The item's asset ID within its context (the property can also be named id).
     * - `appid` - The ID of the app to which the item belongs.
     * - `contextid` - The ID of the context within the app to which the item belongs.
     * - `amount` - Default `1`, if the item is stackable, this is how much of the stack will be added.
     *
     * Returns `true` if the items wasn't already in the offer and so was added successfully, or `false` if it was
     * already in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param items - An array of item objects.
     */
    addMyItems(items: Partial<EconItem>[]): boolean;

    /**
     * Removes an item from your side of the trade offer.
     *
     * Returns `true` if the item was found and removed successfully, or `false` if the item wasn't found in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param item - An item object.
     */
    removeMyItem(item: EconItem): boolean;

    /**
     * Removes the items from your side of the trade offer.
     *
     * Returns `true` if the items was found and removed successfully, or `false` if the items wasn't found in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param items - An array of item objects.
     */
    removeMyItems(items: EconItem[]): boolean;

    /**
     * Adds a given item to a new trade offer. The item object should be in the same format as is returned by the
     * Steam inventory. That is, it should have the following properties:
     *
     * - `assetid` - The item's asset ID within its context (the property can also be named id).
     * - `appid` - The ID of the app to which the item belongs.
     * - `contextid` - The ID of the context within the app to which the item belongs.
     * - `amount` - Default `1`, if the item is stackable, this is how much of the stack will be added.
     *
     * Returns `true` if the item wasn't already in the offer and so was added successfully, or `false` if it was
     * already in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param item - An item object.
     */
    addTheirItem(item: EconItem): boolean;

    /**
     * Adds items to a new trade offer. The item object should be in the same format as is returned by the Steam
     * inventory. That is, it should have the following properties:
     *
     * - `assetid` - The item's asset ID within its context (the property can also be named id).
     * - `appid` - The ID of the app to which the item belongs.
     * - `contextid` - The ID of the context within the app to which the item belongs.
     * - `amount` - Default `1`, if the item is stackable, this is how much of the stack will be added.
     *
     * Returns `true` if the items wasn't already in the offer and so was added successfully, or `false` if it was
     * already in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param items - An array of item objects.
     */
    addTheirItems(items: Partial<EconItem>[]): boolean;

    /**
     * Removes an item from the other side of the trade offer.
     *
     * Returns `true` if the item was found and removed successfully, or `false` if the item wasn't found in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param item - An item object.
     */
    removeTheirItem(item: EconItem): boolean;

    /**
     * Removes the items from the other side of the trade offer.
     *
     * Returns `true` if the items was found and removed successfully, or `false` if the items wasn't found in the offer.
     *
     * As trade offers are created locally, this method does not involve any networking and returns immediately with
     * no callback.
     *
     * @param items - An array of item objects.
     */
    removeTheirItems(items: EconItem[]): boolean;

    /**
     * Returns `true` if the given `item` is in this offer, or `false` if not.
     *
     * @param item - An `item` object containing `appid`, `contextid`, and `assetid`/`id` properties.
     */
    containsItem(item: EconItem): boolean;

    /**
     * Sends a newly-created offer.
     *
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, `null` on success.
     *   - `status` - `pending` if awaiting email/mobile confirmation, `sent` if offer was successfully sent to the other party.
     */
    send(
      callback?: (err: Error | null, status: 'pending' | 'sent') => void,
    ): void;

    /**
     * If this trade offer was sent by us, cancels it. If it was sent to us, declines it. As of v1.1.0, on failure,
     * the `err` object may contain an `eresult` property.
     *
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, `null` on success.
     */
    cancel(callback?: (err: Error | null) => void): void;

    /**
     * If this trade offer was sent by us, cancels it. If it was sent to us, declines it. As of v1.1.0, on failure,
     * the `err` object may contain an `eresult` property.
     *
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, `null` on success.
     */
    decline(callback?: (err: Error | null) => void): void;

    /**
     * Accepts an offer that was sent to us.
     *
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, null on success.
     *   - `status` - `pending` if awaiting email confirmation to be committed, `accepted` if successfully accepted,
     *       `escrow` if it went into escrow.
     *
     *   With the default value of `false` for `skipStateUpdate`, TradeOfferManager will query the trade offer's new
     *   status from the WebAPI before calling your callback. This allows it to check whether the trade went into
     *   escrow or not, and the exact time when escrow will end for this offer.
     *
     *   If this is not a concern for you, you may provide `true` for `skipStateUpdate`. This will bypass the extra
     *   request (which may error out in some cases when acceptance succeeded), but `status` will be `accepted`
     *   instead of `escrow` if the trade is placed on hold. The `state` property of the `TradeOffer` will also not
     *   be updated in this case.
     */
    accept(
      callback?: (
        err: Error | null,
        status: 'pending' | 'accepted' | 'escrow',
      ) => void,
    ): void;

    /**
     * Accepts an offer that was sent to us.
     *
     * @param skipStateUpdate - Defaults to `false`. See below for details.
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, null on success.
     *   - `status` - `pending` if awaiting email confirmation to be committed, `accepted` if successfully accepted,
     *       `escrow` if it went into escrow.
     *
     *   With the default value of `false` for `skipStateUpdate`, TradeOfferManager will query the trade offer's new
     *   status from the WebAPI before calling your callback. This allows it to check whether the trade went into
     *   escrow or not, and the exact time when escrow will end for this offer.
     *
     *   If this is not a concern for you, you may provide `true` for `skipStateUpdate`. This will bypass the extra
     *   request (which may error out in some cases when acceptance succeeded), but `status` will be `accepted`
     *   instead of `escrow` if the trade is placed on hold. The `state` property of the `TradeOffer` will also not
     *   be updated in this case.
     */
     accept(
      skipStateUpdate?: boolean,
      callback?: (
        err: Error | null,
        status: 'pending' | 'accepted' | 'escrow',
      ) => void,
    ): void;

    /** Returns a new unsent `TradeOffer` object that contains the same items as this one. */
    duplicate(): TradeOffer;

    /**
     * Returns a new unsent `TradeOffer` object that contains the same items as this one. Sending the new trade
     * offer will send a counter offer, and this offer will be marked as `Countered`.
     */
    counter(): TradeOffer;

    /**
     * Fetch the latest data for this offer from the WebAPI. When the callback is fired, if an error didn't occur
     * then all of this offer's properties will be updated with the newest values.
     *
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, `null` on success
     */
    update(callback: (err: Error | null) => void): void;

    /**
     * Can be called on an accepted offer to retrieve item data about the items you received, including names,
     * descriptions, and new assetids.
     *
     * Will not include any `actions` (e.g. the CS:GO inspect link) unless `getActions` is true.
     *
     * @param getActions - If `true`, then the descriptions of the received items will be loaded from the WebAPI in
     *   order to populate the items `actions`. Default `false`.
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, `null` on success
     *   - `items` - An array of `EconItem` objects that you received.
     */
    getReceivedItems(
      getActions: boolean,
      callback: (err: Error | null, items: EconItem[]) => void,
    ): void;

    /**
     * Can be called on an accepted offer to retrieve item data about the items you received, including names,
     * descriptions, and new assetids.
     *
     * @param callback - A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, `null` on success
     *   - `items` - An array of `EconItem` objects that you received.
     */
    getReceivedItems(
      callback: (err: Error | null, items: EconItem[]) => void,
    ): void;

    /**
     * Gets detailed information for the items exchanged in this trade, including old and new asset IDs. This can be
     * called for any trade offer that has a `tradeID` property defined that isn't `null`, including those that are
     * in escrow or have failed.
     *
     * @param getDetailsIfFailed - If `false` and the trade's state is anything but `Complete`, `InEscrow`, or
     *   `EscrowRollback`, then the callback will report an error instead of returning the data to you. This is
     *   intended to prevent ignorant developers from blindly trusting the data they get without verifying that the
     *   trade has completed successfully. Defaults to `false`.
     * @param callback- A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, or `null` on success
     *   - `status` - The status of this trade, which differs from the trade offer state. One of the values from the
     *       which is accessible via `ETradeStatus`.
     *   - `tradeInitTime` - A `Date` object representing when Steam began processing the item exchange. If this trade
     *       was held, then this is the time when Steam began removing items from both parties' inventories, i.e.
     *       the time when the trade went into escrow.
     *   - `receivedItems` - An array of `EconItem` objects for items you received in this trade (see below)
     *   - `sentItems` - An array of `EconItem` objects for items you lost in this trade (see below)
     */
    getExchangeDetails(
      getDetailsIfFailed: boolean,
      callback: (
        err: Error | null,
        status: ETradeStatus,
        tradeInitTime: Date,
        receivedItems: EconItem[],
        sentItems: EconItem[],
      ) => void,
    ): void;

    /**
     * Gets detailed information for the items exchanged in this trade, including old and new asset IDs. This can be
     * called for any trade offer that has a `tradeID` property defined that isn't `null`, including those that are
     * in escrow or have failed.
     *
     * @param callback- A callback to be invoked when complete.
     *
     *   - `err` - An `Error` object on failure, or `null` on success
     *   - `status` - The status of this trade, which differs from the trade offer state. One of the values from the
     *       enum, which is accessible via `ETradeStatus`.
     *   - `tradeInitTime` - A `Date` object representing when Steam began processing the item exchange. If this trade
     *       was held, then this is the time when Steam began removing items from both parties' inventories, i.e.
     *       the time when the trade went into escrow.
     *   - `receivedItems` - An array of `EconItem` objects for items you received in this trade (see below)
     *   - `sentItems` - An array of `EconItem` objects for items you lost in this trade (see below)
     */
    getExchangeDetails(
      callback: (
        err: Error | null,
        status: ETradeStatus,
        tradeInitTime: Date,
        receivedItems: EconItem[],
        sentItems: EconItem[],
      ) => void,
    ): void;

    /**
     * @param callback - Called when the requested data is available.
     *
     *   - `err` - An Error object if there was an error, or null on success.
     *   - `me` - An object containing your user data.
     *   - `them` - An object containing the other user's user data.
     */
    getUserDetails(
      callback: (err: Error | null, me: UserData, them: UserData) => void,
    ): void;

    /**
     * Sets this unsent offer's message. Messages are limited by Steam to 128 characters.
     *
     * @param message - The new message you want to send with this offer. Can be empty string.
     */
    setMessage(message: string): void;

    /**
     * Sets this unsent offer's access token, which is needed to send trade offers to non-friends. This token will
     * be used to send the offer, and then will be discarded.
     *
     * @param token - The access token you want to use to send this offer
     */
    setToken(token: string): void;
  }

  class EconItem {
    /** The item's unique ID within its app+context. */
    id: string;

    /** The item's unique ID within its app+context. */
    assetid: string;

    /** The ID of the context within the app in which the item resides. */
    contextid: string;
    currencyid: string;

    new_assetid?: string;
    new_contextid?: string;

    /** The ID of the app which owns the item. */
    appid: number;

    /** The first half of the item cache identifier. The classid is enough to get you basic details about the item. */
    classid: string;

    /** The second half of the item cache identifier. */
    instanceid: string;

    /** How much of this item is in this stack. */
    amount: number;

    /**
     * The item's position within the inventory (starting at 1). Not defined if this item wasn't retrieved directly
     * from an inventory (e.g. from a trade offer or inventory history).
     */
    pos: number;

    /** The item's display name. */
    name: string;

    /** The item's universal market name. This identifies the item's market listing page. */
    market_hash_name: string;

    /** The render color of the item's name, in hexadecimal. */
    name_color: string;

    /** The displayed background color, in hexadecimal. */
    background_color: string;

    /** The "type" that's shown under the game name to the right of the game icon. */
    type: string;

    /** `true` if the item can be traded, `false` if not. */
    tradable: boolean;

    /** `true` if the item can be listed on the Steam Community Market, `false` if not. */
    marketable: boolean;

    /** `true` if, on the Steam Community Market, this item will use buy orders. `false` if not. */
    commodity: boolean;

    /** How many days for which the item will be untradable after being sold on the market. */
    market_tradable_restriction: number;

    /** How many days for which the item will be unmarketable after being sold on the market. */
    market_marketable_restriction: number;

    /** An array of objects containing information about the item. Displayed under the item's `type`. */
    descriptions: EconItemDescription[];
    owner_descriptions: EconItemDescription[];
    actions: EconItemAction[];
    owner_actions: EconItemAction[];
    market_actions: any[];

    /**
     * An array of strings containing "fraud warnings" about the item. In inventories and trades, items with fraud
     * warnings have a red (!) symbol, and fraud warnings are displayed in red under the item's name.
     */
    fraudwarnings: string[];

    /** An array of objects containing the item's inventory tags. */
    tags: Tag[];

    /** Not always present. An object containing arbitrary data as reported by the game's item server. */
    app_data?: any;

    /**
     * Returns a URL where this item's image can be downloaded. You can optionally append a size as such:
     *
     * ```js
     * var url = item.getImageURL() + '128x128';
     * ```
     */
    getImageURL(): string;

    /** Returns a URL where this item's image can be downloaded. */
    getLargeImageURL(): string;

    /**
     * Returns a specific tag from the item, or `null` if it doesn't exist.
     *
     * @param category - A string containing the tag's category (the `category` property of the tag object).
     */
    getTag(category: string): Tag | null;
  }

  export default class TradeOfferManager extends EventEmitter {
    /**
     * The time, in milliseconds, between
     * disabled.
     *
     * Minimum `1000`, default `30000` (30 seconds).
     */

    pollInterval: number;

    /**
     * The time, in milliseconds, that a sent offer can remain Active until it's automatically canceled by the manager.
     * This feature is disabled if omitted.
     *
     * Note that this check is performed on
     * expected if timed polling is enabled. Also note that because polling is on a timer, offers will be canceled
     * between `cancelTime` and `cancelTime + pollInterval` milliseconds after being created, assuming Steam is up.
     */
    cancelTime: number;

    /**
     * The time, in milliseconds, that a sent offer can remain CreatedNeedsConfirmation until it's automatically
     * canceled by the manager. This feature is disabled if omitted. All documentation for `cancelTime` applies.
     */
    pendingCancelTime: number;

    /** Once we have this many outgoing Active offers, the oldest will be automatically canceled. */
    cancelOfferCount: number;

    /**
     * If you're using `cancelOfferCount`, then offers must be at least this many milliseconds old in order to qualify
     * for automatic cancellation.
     */
    cancelOfferCountMinAge: number;

    /**
     * If passed, this will be assigned to
     */
    pollData: any;

    /**
     * A read-only property containing your account's API key once the callback of
     * fires for the first time.
     */
    apiKey: string;

    /** A `SteamID` object containing the SteamID of the account we're logged in as. `null` until the first call to `setCookies`. */
    steamID: SteamID;
    storage: any;

    constructor(options: Options);

    on<T extends keyof EventListener>(
      event: T,
      listener: EventListener[T],
    ): this;

    /**
     * @param cookies - An array of cookies in `name=value` form. This is the format used by `node-steam`,
     *   `node-steam-user`, and `node-steamcommunity`, so any of those modules can be used to get cookies.
     * @param familyViewPin - If your account has Family View enabled, you need to supply your PIN here. Once you've set
     *   cookies initially, you can use parentalUnlock if you need to re-authenticate for any reason.
     * @param callback - Will be called once the API key is retrieved and the module is ready for use. The first
     *   argument will be `null` on success or an `Error` object on failure. You'll get an `Access Denied` error if your
     *   account is limited.
     */
    setCookies(
      cookies: string[],
      familyViewPin?: string,
      callback?: (err: Error | null) => void,
    ): void;

    /**
     * Stops polling, removes the Steam client reference, and clears cookies. Suitable for use if you want to log out of
     * your bot's account but not terminate the process.
     */
    shutdown(): void;

    /**
     * @param pin - Your 4-digit PIN code
     * @param callback - Called on completion with a single argument which is `null` on success or an `Error` object on
     *   failure. Error is `Incorrect PIN` if your PIN was wrong.
     */
    parentalUnlock(pin: string, callback?: (err: Error | null) => void): void;

    /**
     * Create a new TradeOffer object.
     *
     * @param partner - Their full Trade URL or their SteamID (as a SteamID object or a string that can parse into one)
     * @param token - Their trade token, if you aren't friends with them
     */
    createOffer(partner: SteamID | string, token?: string): TradeOffer;

    /**
     * Get a trade offer that is already sent (either by you or to you).
     *
     * @param id - The offer's numeric ID
     * @param callback
     */
    getOffer(
      id: number | string,
      callback: (err: Error | null, offer: TradeOffer) => void,
    ): void;

    /**
     * Get a list of trade offers either sent to you or by you.
     *
     * @param filter
     * @param callback
     */
    getOffers(
      filter: EOfferFilter,
      callback: (
        err: Error | null,
        sent: TradeOffer[],
        received: TradeOffer[],
      ) => void,
    ): void;

    /**
     * Get a list of trade offers either sent to you or by you.
     *
     * @param filter
     * @param historicalCutoff - Pass a Date object in the past along with ActiveOnly to also get offers that were
     *   updated since this time
     * @param callback
     */
    getOffers(
      filter: EOfferFilter,
      historicalCutoff: Date,
      callback: (
        err: Error | null,
        sent: TradeOffer[],
        received: TradeOffer[],
      ) => void,
    ): void;

    /**
     * Get the token parameter from your account's Trade URL.
     *
     * @param callback
     */
    getOfferToken(callback: (err: Error | null, token: string) => void): void;

    /**
     * Get the offers which contain the given item(s).
     *
     * @param items - Either a single item object (with appid, contextid, and assetid/id properties) or an array of item objects
     * @param callback
     */
    getOffersContainingItems(
      items: EconItem[],
      callback: (
        err: Error | null,
        sent: TradeOffer[],
        received: TradeOffer[],
      ) => void,
    ): void;

    /**
     * Get the offers which contain the given item(s).
     *
     * @param items - Either a single item object (with appid, contextid, and assetid/id properties) or an array of item objects
     * @param includeInactive If true, then offers which aren't Active or InEscrow will be checked. Default false.
     * @param callback
     */
    getOffersContainingItems(
      items: EconItem[],
      includeInactive: boolean,
      callback: (
        err: Error | null,
        sent: TradeOffer[],
        received: TradeOffer[],
      ) => void,
    ): void;

    doPoll(): void;
  }
}
