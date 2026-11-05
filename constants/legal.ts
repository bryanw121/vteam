/**
 * Terms and Conditions and Privacy Policy, rendered by `components/legal/LegalDocument`
 * at the public routes /terms and /privacy (and linked from sign-up, login and Profile).
 *
 * Plain Markdown subset: `#`/`##` headings, paragraphs, `- ` bullets, tables and
 * `**bold**`. Text in escaped brackets (`\[fill in on publish\]`) is a placeholder
 * Bryan fills in before publishing; the renderer highlights it.
 *
 * When the Terms change materially, update the text and bump TERMS_VERSION.
 */

/**
 * Version of the Terms (and Privacy Policy) a new account agrees to. Email
 * sign-up sends it in the auth metadata; `handle_new_user` stores it on
 * `profiles.terms_version` with `terms_accepted_at`. Google sign-in can't send
 * metadata, so the trigger falls back to a copy of this value: bump both.
 */
export const TERMS_VERSION = '2026-10-27'

export const TERMS_MARKDOWN = String.raw`# vteam Terms and Conditions

Oct 27, 2026

## Agreement

By creating an account or using vteam, you agree to these Terms and to our Privacy Policy. If you don't agree, don't use vteam. vteam (the mobile apps and vteamvolleyball.com) is operated from Austin, Texas ("we", "us").

**Effective date:** \[fill in on publish\]

## Eligibility and accounts

- You must be at least 13 years old. If you are under 18, a parent or guardian must agree to these Terms for you.
- Give accurate information, keep your password private, and tell us if your account is compromised. You're responsible for activity on your account.
- One person per account. Usernames that impersonate others or are offensive may be changed or removed.
- vteam is in beta. Features may change, break or be removed, and data may be reset in rare cases.

## Events and hosts

vteam is a platform for finding and organizing volleyball events. We don't run, supervise or insure the events listed on it.

- **Hosts** are responsible for their events: accurate details, the venue and any permission to use it, capacity, and how they treat attendees. Hosts may approve, decline or remove attendees.
- **Players** should RSVP honestly and cancel in the app if plans change.
- **External listings** (open-play sessions from other organizers' public schedules) are shown for convenience. We don't control them and can't promise they're accurate; check with the organizer.

## Payments

vteam does not process payments. When a host lists a price and a Venmo handle, any payment happens directly between you and the host, outside vteam. Refunds, disputes and missed payments are between you and the host. We're not a party to those transactions and aren't responsible for them.

## Assumption of risk

Volleyball is a physical sport, and injuries can happen. You take part in any event at your own risk and are responsible for judging whether an event, venue or group is safe and suitable for you. Meet people in public places, and use your own judgment when meeting someone you met through vteam.

## Acceptable use

Don't use vteam to:

- Harass, threaten, discriminate against or impersonate anyone
- Post content that is illegal, sexually explicit, hateful or violent, or that infringes someone else's rights
- Create fake events, spam, or mislead people about an event, price or venue
- Scrape, overload, reverse-engineer or get around the Service's security or limits
- Collect other users' personal information for purposes unrelated to playing volleyball

## Your content

You own what you post (profile, photos, messages, event details). You give us a non-exclusive, worldwide, royalty-free license to host, display and share it as needed to run the Service. This license ends when you delete the content or your account, except where others have already seen or copied it, or where we must keep it by law. You confirm you have the right to post it.

We may remove content or restrict features if we believe content breaks these Terms. You can report a user or content to us by email.

## Ending your account

You can delete your account at any time. We may suspend or close accounts that break these Terms, put others at risk, or create legal exposure for us, with notice when reasonable. The sections on payments, content license, disclaimers, liability and disputes survive after your account ends.

## Disclaimers

vteam is provided "as is" and "as available", without warranties of any kind, including fitness for a particular purpose, accuracy of event listings, or uninterrupted service. We don't vet users, hosts, venues or events.

## Limitation of liability

To the fullest extent the law allows, we are not liable for indirect, incidental, special or consequential damages, or for injuries, losses or disputes arising from events, payments or interactions with other users. Our total liability for any claim about the Service is limited to the greater of what you paid us in the past 12 months or US$50. Some places don't allow these limits, so they may not fully apply to you.

You agree to cover our reasonable costs from claims caused by your content, your events, or your breaking these Terms.

## Governing law and disputes

These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules. Disputes will be handled in the state or federal courts in Travis County, Texas, unless your local law gives you the right to bring a claim where you live. Please email us first; most issues can be solved informally.

## Apple and Google

If you got vteam from the App Store or Google Play, these Terms are between you and us, not Apple or Google, who have no responsibility for the app or its support. Apple is a third-party beneficiary of these Terms for iOS users.

## Changes

We may update these Terms. We'll change the effective date and, for material changes, notify you in the app or by email before they take effect. Continuing to use vteam after that means you accept the new Terms.

## Contact

**support@vteamvolleyball.com** \[set up this address before publishing\]
`

export const PRIVACY_MARKDOWN = String.raw`# vteam Privacy Policy

Oct 27, 2026

## About this policy

This Privacy Policy describes how vteam generally collects, uses and shares information. It covers the vteam mobile apps (iOS and Android) and the web app at vteamvolleyball.com (together, "vteam" or "the Service").

vteam is operated from Austin, Texas ("we", "us"). vteam is in beta, and our practices may change as the Service changes. This policy is a description of our practices, not a contract, and does not create rights for any third party. Your use of vteam is also governed by our Terms and Conditions, which control if the two conflict.

**Effective date:** \[fill in on publish\]

## Information we collect

| What | Examples | Where it comes from |
| --- | --- | --- |
| Account details | First and last name, username, email, password (stored hashed by our auth provider) | You, at sign-up |
| Sign-in with Google or Apple | Name and email shared by that provider | Google or Apple, with your permission |
| Profile | Photo, bio, position, skill level, badges, home city, display settings | You |
| Events, clubs and tournaments | Events you host or join, RSVP and approval status, guests you add, teams, club membership, results | Your activity |
| Messages and social activity | Chats and photos sent in chat, reactions, event comments, club posts, kudos | You |
| Feedback | Bug reports and feature requests you submit | You |
| Host payment info | A host's Venmo handle and the event price they set | Hosts |
| Event locations | Venue address and map coordinates | Hosts |
| Guest names | First and last name of a guest a member adds to an event (guests may not have a vteam account) | The member who adds them |
| Device and usage data | Platform (iOS, Android or web), push notification token, a random device ID, in-app actions (for example, tutorial steps viewed), notification preferences | Your device, automatically |
| Crash and error reports | Error details, device model, OS version, your account ID, and your IP address | Your device, via our crash reporter |

We do not collect your GPS location; event addresses are entered by hosts. If you add an event to your calendar, vteam writes that event to your device calendar but does not read it. If you choose a profile photo, vteam accesses only the photo you pick.

vteam does not process payments. Payments between players and hosts happen outside vteam (for example, in Venmo) under that service's own terms, and vteam is not designed to collect card or bank details.

We may also receive other information you choose to give us, such as when you contact us.

**Third-party session listings.** vteam may show open-play sessions compiled from publicly available schedules published by other venues and organizers. These listings describe sessions, venues and times, not vteam users, and no vteam user data is sent to those sources. Listings are provided for convenience, may be incomplete or out of date, and are subject to the organizer's own terms and policies. Organizers who want a listing corrected or removed can contact us.

## How we use and share it

We may use information to operate, maintain and improve the Service and to develop new features; create and manage accounts; show and manage events; connect players with hosts; send notifications; communicate with you; understand how the Service is used; detect, prevent and respond to fraud, abuse, security issues and violations of our Terms; and comply with law.

**What is public.** vteam is a community app, so much of your activity is visible to other users and to anyone browsing without an account: your full name, username, profile photo, bio, position, skill level, badges, clubs, kudos you give and receive, and the events you join with your RSVP status. Event details are public too, including the venue address and the host's Venmo handle. Names of guests added to an event are shown on that event. Photos (profile, club and chat images) are stored at links that anyone who has the link can open. Messages are visible to the people in that conversation.

**Push notifications.** Notifications are delivered through Apple Push Notification service (iOS) and Firebase Cloud Messaging (Android). Chat notifications include the sender's name and the message text.

**Service providers.** We use service providers to help operate vteam. They may process information on our behalf under their own terms, and currently include:

| Provider | What they do |
| --- | --- |
| Supabase | Database, authentication, file storage, server functions, sign-in and password-reset emails |
| Vercel | Hosts the web app |
| Expo (650 Industries) | App updates and push notification delivery |
| Apple and Google (Firebase) | Deliver push notifications to your device |
| Google Maps Platform | Venue search: what a host types to find a venue is sent to Google |
| Sentry | Crash and error reporting |
| Google and Apple | Sign-in, if you choose it; app distribution |

These providers may process data in the United States and other countries.

**Other sharing.** We may disclose information when we believe in good faith it is reasonably necessary to comply with law or legal process; to enforce our Terms; to protect the rights, property or safety of vteam, our users or others; to investigate fraud or abuse; or in connection with a merger, sale, financing, reorganization or transfer of all or part of the Service. We may also share information that is aggregated or de-identified. As of the effective date, vteam does not sell personal information or use it for third-party advertising.

**How long we keep it.** We generally keep information for as long as your account is open and as long as we consider reasonably necessary for the purposes above. After an account is deleted, we take reasonable steps to delete or de-identify personal information within a reasonable time, but we may keep information as needed to comply with law, resolve disputes, prevent abuse, enforce our Terms, or where it remains in backups, logs or providers' systems. Content others have copied or that appears in their conversations may remain visible.

**Legal bases (EEA and UK visitors).** We process your data to provide the Service you signed up for (contract), to keep it secure and fix crashes (legitimate interests), and to send push notifications (your consent, which you can withdraw in settings).

## Your choices and rights

- **Edit your profile** in the app.
- **Turn off push notifications** in the app or your phone's settings.
- **Request deletion of your account** by emailing us.
- **Request access to your data** by emailing us. We may need to verify your identity, and will respond as required by applicable law.

Depending on where you live, you may have additional rights under applicable law, such as to correct your data or appeal a decision about your request. Where those laws apply, email us to make a request. Some rights are subject to exceptions and limits under those laws.

## Children

You must be 13 or older to use vteam. We do not knowingly collect information from children under 13. If we learn that we have, we will take steps to delete it. If you believe a child under 13 has an account, please contact us.

## Security

We use measures designed to help protect information, such as encryption in transit and database access rules. No method of transmission or storage is completely secure, and we cannot guarantee the security of any information. You use the Service at your own risk, and you are responsible for keeping your password safe.

## Do Not Track

vteam doesn't track you across other websites or apps, and we don't respond to browser Do Not Track signals.

## Changes to this policy

We may update this policy from time to time. We'll post the updated version with a new effective date, and may also notify you in the app or by email where required by law. Continuing to use vteam after an update means the updated policy applies.

## Contact

Questions or requests: **privacy@vteamvolleyball.com** \[set up this address before publishing\].
`
