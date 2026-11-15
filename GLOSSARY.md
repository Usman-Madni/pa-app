# PA App

A personal assistant for tasks, reminders, notes and a calendar, kept in one data file and edited on one computer at a time. Background and decisions are in `PA_APP_CONTEXT.md`.

## Repeating tasks

**Series**:
All the copies of one repeating task, past and future. A series has one title.
_Avoid_: recurrence, chain

**Copy**:
One occurrence of a repeating task, with its own due date, done state, moving part and notes.
_Avoid_: instance, occurrence

**Next copy**:
The copy made when the current one is ticked off, due on the repeat's next date. There is at most one open copy of a series at a time.
_Avoid_: spawned task, child

**Untouched**:
A next copy that is still exactly as it was made. Reminders going off and a series rename don't count as touching it. Unticking takes an untouched next copy away without asking.
_Avoid_: unchanged, pristine

**Moving part**:
The part of a repeating task's name that moves forward with each copy, shown in brackets after the title: "Rent (Nov 26)" then "Rent (Dec 26)".
_Avoid_: period (in conversation), date suffix

**Anchor**:
The day a repeat keeps coming back to ("the 31st", "the last Friday"), taken from the due date so that short months don't move it for good.

## Reminders

**Reminder**:
A moment PA App reminds you about a task: a time before the due date ("1 hour before", "evening before") or an exact date and time. A task can have several; each goes off once.
_Avoid_: alarm (a reminder going off shows a notification)

**Missed reminder**:
A reminder that went off more than 10 minutes before PA App could show it, because PA App was closed or the laptop asleep. Missed reminders are named together in one message rather than popping up.

**Notification**:
A message PA App showed (a reminder, "Added …", a sync problem), kept with its time for 30 days in the Notifications list.
_Avoid_: alert, log entry

## Editing

**Task edit**:
A change to a task that brings follow-up changes with it: a new due date (reminders count from it again, the anchor moves), a rename (every copy of the series gets the title) or a new repeat (a date in the title becomes the moving part). The same task edit behaves the same wherever it's made: in the task panel, in quick add or on the phone through To Do.
_Avoid_: field update

## People

**Person**:
Someone a task, note or event belongs to: you, or someone you added (a family member). Each person can have a zakat day.
_Avoid_: user, account (until people sign in themselves), owner

**You**:
The person this app belongs to, always there and never removed. Anything with no people is yours. Only tasks you're on remind you and go to your To Do.
_Avoid_: me (in what the app says), self

**Showing**:
Whose things the screens show on this device: Everyone or one person. It filters what you see; it never changes who anything belongs to.
_Avoid_: profile, switch user, filter (in conversation)

**Asset**:
Something a person owns or owes, of one kind: gold, silver, cash and accounts, property, a vehicle, an investment, money owed to you, a debt, or other. A debt is an asset that counts as minus.
_Avoid_: holding, item (in conversation)

**Amount**:
What a non-metal asset was on a day: an account's balance, a property's value, what's still owed. Kept by date; the value on a day is the latest amount on or before it.
_Avoid_: entry, snapshot

**Rates**:
A day's prices: gold per tola for each karat, silver per tola, and rupees for one of each other currency. Gold, silver and foreign amounts are valued with the latest rates on or before the day.
_Avoid_: prices (in conversation), quotes

**Transfer**:
Giving an asset (or a share of it) to someone else from a date on. Who owned it before is kept, so earlier days still count them.
_Avoid_: move, reassign

**Zakat day**:
A person's yearly zakat date, kept as an Islamic day and month (for example 15th Sha'ban).

**Zakat record**:
One person's zakat for one year: what they had on their zakat day (their share of each asset, at that day's rates), the nisab, and what's due. A draft until marked done; done, it's frozen.
_Avoid_: calculation, payable (in what the app says)

**Nisab**:
The least wealth on which zakat is due: 52.5 tola of silver at the day's silver rate.

**Carried**:
Paid more than a year's zakat and counted towards the next year, instead of kept as extra charity.
_Avoid_: credit, advance

## Storage and devices

**Data file**:
The one JSON file that holds all tasks, notes and events, saved to automatically from the computer that edits. Per-device settings never go in it.
_Avoid_: database, backup (a backup is a dated copy of the data file)

**Read-only device**:
A phone, tablet or browser that can open the data file but never change it.
_Avoid_: viewer, mobile mode

**Phone reminders**:
The copy of every open task in a "PA App" list in Microsoft To Do, which does the notifying on the phone and sends ticks and edits back.
_Avoid_: To Do sync (in conversation), push notifications
