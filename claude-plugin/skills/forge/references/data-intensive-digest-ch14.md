<!-- forge reference: a page-cited digest of Designing Data-Intensive Applications, 2nd ed. (Kleppmann & Riccomini, O'Reilly 2026), chapter 14. Written while reading the chapter; every rule, number, failure mode, question and property carries its page. The condensed layer is references/data-intensive-protocol.md (§0-§8); the row-level map is references/data-intensive-book-map.md; this file is the full layer the requirements data round and the build Phase 4 review consult for the chapters a DATA.md group cites. -->

# Digest: Chapter 14 - Doing the Right Thing

Source: Kleppmann and Riccomini, Designing Data-Intensive Applications, 2nd edition (O'Reilly 2026), pp. 585-602. Page refs are the printed page numbers from the running footers of the pdftotext extraction.

## Thesis

Every system is built for a purpose and "every action we take has both intended and unintended consequences"; engineers "have a responsibility to carefully consider those consequences and to ensure that our decisions do not cause harm" (p.585).
Many datasets are about people, so they must be treated "with humanity and respect"; "human dignity is paramount" (p.585). Ethics "is not going through a checklist" but "a participatory and iterative process of reflection, in dialog with the people involved, with accountability for the results" (p.586).
Two problem clusters: predictive analytics (bias amplification, unaccountable and unappealable decisions, self-reinforcing feedback loops) and data collection itself (tracking that becomes surveillance, consent that is not meaningful, privacy as a decision right transferred to corporations, personal data as a "toxic asset") (p.586-595).
The remedy combines legislation such as the GDPR with a culture shift toward self-regulation: collect for specified purposes only, minimize collection, purge data when no longer needed, educate users, and treat users as humans rather than metrics (p.596-597).

## Decision rules

| rule | when it applies | why (mechanism) | page |
|---|---|---|---|
| Consider both intended and unintended consequences of every system and take responsibility for them | all projects | "Every system is built for a purpose; every action we take has both intended and unintended consequences" | p.585 |
| Treat data about people with humanity and respect; human dignity is paramount | any dataset about behavior, interests, identity | "Users are humans too" | p.585 |
| Actually apply codes of ethics (e.g. ACM Code of Ethics), do not just cite them | engineering practice | guidelines "are rarely discussed, applied, and enforced", producing a "cavalier attitude to privacy" | p.585 |
| Judge a technology by how it is used and how it affects people, not as neutral | evaluating features | "A technology is not good or bad in itself"; the ethical responsibility "is ours to bear" | p.585-586 |
| Do ethics as participatory, iterative reflection with those affected and with accountability, not as a compliance checklist | product development | ethical concepts "require interpretation, which may be subjective" | p.586 |
| Distinguish predictions about nature (weather, disease spread) from predictions about individuals (reoffending, loan default, insurance claims) | scoping predictive analytics | the latter "have a direct effect on individual people's lives" | p.586 |
| Beware the institutional bias toward "if in doubt ... saying no" | fraud screening, lending, hiring, travel security | for the organization a missed opportunity is cheap; for the person, accumulated refusals across society become an "algorithmic prison" | p.586 |
| Preserve presumption of innocence and a real chance of appeal in automated exclusion | any system that labels people as risky | automated systems can "systematically and arbitrarily exclude a person from participating in society without any proof of guilt, and with little chance of appeal" | p.586 |
| Do not assume data-driven decisions are fairer than human ones | replacing human judgment with models | decisions by algorithm are "not necessarily any better or any worse"; biased input means the system "will most likely learn and amplify that bias in its output" | p.586-587 |
| Check features for correlation with protected traits (ethnicity, age, gender, sexuality, disability, beliefs), e.g. postal code or IP address | feature selection and model review | proxies reproduce prohibited discrimination; "machine learning is like money laundering for bias" | p.587 |
| Recognize that models extrapolate the past; supply human "moral imagination" | any predictive system touching people | "if the past is discriminatory, they codify and amplify that discrimination"; "Data and models should be our tools, not our masters" | p.587 |
| Assign a human who is accountable for algorithmic decisions; never let people hide behind the algorithm | deployment governance | "who is accountable if they go wrong?"; "People should not be able to evade their responsibility by blaming an algorithm" | p.587 |
| Be able to explain how a specific decision was reached to a judge or reviewer | models whose decisions may face judicial review | "can you explain to the judge how the algorithm made its decision?" | p.587 |
| Prefer decisions based on the person's own relevant facts over similarity-to-others, and provide error correction | scoring systems | a credit score asks "How did you behave in the past?", predictive analytics asks "Who is similar to you"; that "implies stereotyping"; with erroneous data "recourse is almost impossible" | p.587-588 |
| Treat outputs as probabilistic and expect individual cases to be wrong | acting on scores or predictions | "even if the probability distribution on the whole is correct, individual cases may well be wrong" (life expectancy of 80 example) | p.588 |
| Reject blind belief in the supremacy of data | decision-making culture | such belief "is not only delusional but also positively dangerous" | p.588 |
| Use analytics about vulnerability to help, never to prey | insights into financial and social characteristics | the same power can "focus aid" or let "predatory businesses" sell "high-cost loans or worthless college degrees" | p.588 |
| Watch recommendation systems for echo chambers | content ranking and personalization | showing people "only opinions they already agree with" breeds "stereotypes, misinformation, and polarization" | p.588 |
| Look for self-reinforcing feedback loops before and after deployment | predictive analytics affecting lives (credit scores used in hiring, algorithmic pricing) | a downward spiral "hidden behind a camouflage of mathematical rigor and data"; pricing algorithms "learned to collude" | p.588-589 |
| Apply systems thinking: analyze the whole system including the people interacting with it | design reviews | ask whether the system "reinforce[s] and amplif[ies] existing differences between people ... or does it try to combat injustice"; expect unintended consequences | p.589 |
| Distinguish data the user explicitly entered (user is the customer) from behavioral data tracked as a side effect | data collection design | with tracking the service "takes on interests of its own, which may conflict with the user's interests" | p.589 |
| Track only what directly improves user-facing features (click-through ranking, recommendations, A/B tests); question tracking driven by advertising | deciding what to log and retain | when ads fund the service "the advertisers are the actual customers, and the users' interests take second place"; data "is retained for a long time" to build profiles | p.589-590 |
| Run the "replace the word data with surveillance" test on your own practices | evaluating a data strategy | if "surveillance warehouse" sounds sinister, examine your relationship with the people whose data it is | p.590 |
| Treat always-on sensors (microphones, location, wearables) as high-risk and note their security record | devices and apps | "Many of these devices have a terrible security record"; a collector "may end up knowing more about a person than that person knows about themselves" | p.590 |
| Do not accept "nothing to hide" or "the purpose is benign" as justification | privacy debates | nothing-to-hide presumes you are "totally in line with existing power structures"; benign purposes blur once surveillance decides "insurance coverage or employment" | p.590-591 |
| Ask why tracking is necessary before claiming consent covers it | consent flows | some tracking improves features; profiling "for advertising purposes" is "less clear whether this is genuinely in the user's interest" | p.591 |
| Do not treat consent as meaningful when users cannot understand derived datasets, or when data describes non-users | consent scope | privacy policies "do more to obscure than to illuminate"; "data from one user also says things about other people who are not users" | p.591 |
| Avoid one-way, asymmetric data extraction; allow negotiation and reciprocity | terms of service | "no dialogue, no option for users to negotiate how much data they provide" | p.591-592 |
| Meet the GDPR consent standard: freely given, specific, informed, unambiguous; refusable and withdrawable without detriment; clear and plain language; no silence, pre-ticked boxes or inactivity | EU personal data processed on the basis of consent | otherwise consent "is not considered 'freely given'" | p.592 |
| Choose the right lawful basis instead of forcing consent (legal compliance, protecting life, legitimate interest such as fraud prevention) | lawful-basis selection | consent is "the most frequently used basis" but not the only one; fraudsters "would presumably not consent" | p.592 |
| Do not treat "just do not use the service" as a free choice | essential services with network effects | use is "effectively mandatory"; opting out carries social and professional cost; "For people in a less privileged position, there is no meaningful freedom of choice" | p.592 |
| Avoid gambling-style engagement mechanics | product design | platforms "use game mechanics and tactics common in gambling to keep users coming back" | p.592 |
| Define privacy as the user's decision right over what to reveal to whom, and design per-situation choices | data sharing features | "privacy does not mean keeping everything secret"; a patient may share with researchers but not insurers | p.592-593 |
| Do not take over the privacy right with "trust us" and exercise it for profit | internal data use and ad targeting | companies keep outcomes secret because revealing them "would be perceived as creepy"; users lose "agency about the disclosure of some intimate information" | p.593 |
| Expect data to be wrong, undesirable or inappropriate and build mechanisms to handle those failures; be humble | insight and reminder features | something "factually correct" may trigger "painful memories"; algorithms are oblivious "unless we explicitly program them to respect human needs" | p.593 |
| Treat privacy settings as a starting point and also constrain the service's own internal use | privacy controls | the service "still has unfettered access" and "grants itself unrestricted rights to process and analyze the data internally" | p.593-594 |
| Govern sensitive data like doctor-patient or attorney-client relationships | sensitive personal information | those uses are "strictly governed by ethical, legal, and regulatory constraints"; internet services amass data "without meaningful consent" | p.594 |
| Do not call behavioral data "exhaust"; treat it as labor or a valuable asset | economics of data | user activity that funds ads "could be regarded as a form of labor"; data brokers and "eyeballs" valuations prove its value | p.594 |
| Treat personal data as a "toxic asset" / "hazardous material" / "new uranium": weigh benefit against leaks, theft, insiders, hostile management, compelled disclosure and bankruptcy sales | before collecting anything | "whenever we collect it, we need to balance the benefits with the risk of it falling into the wrong hands" | p.594-595 |
| Consider all possible future governments, not just today's | long-lived data stores | "It is poor civic hygiene to install technologies that could someday facilitate a police state" | p.595 |
| Expect and accept regulation like the Industrial Revolution's safeguards; treat data as pollution and privacy as the environmental challenge | strategy | regulations raised costs but "society as a whole benefited hugely"; "how we contain it and how we dispose of it--is central" | p.595-596 |
| Collect for specified, explicit, legitimate purposes and limit data to what is necessary (purpose limitation, data minimization) | data design | GDPR wording; this "runs directly counter to the philosophy of big data"; exploration means "unforeseen purposes" | p.596 |
| Do not rely on enforcement to make you behave; self-regulate | compliance strategy | GDPR "has been weakly enforced" and has not changed "culture and practices across the wider tech industry" | p.596 |
| Balance opportunity against risk case by case, e.g. medical data research | sensitive data sharing | "Overregulation may prevent such breakthroughs"; "It is difficult to balance" | p.596 |
| Stop regarding users as metrics to be optimized | product metrics and growth targets | users "are humans who deserve respect, dignity, and agency" | p.596 |
| Educate end users about how their data is used | transparency | "rather than keeping them in the dark" | p.596-597 |
| Purge data as soon as it is no longer needed, and minimize what is collected in the first place | retention policy | "Data you don't have is data that can't be leaked, stolen, or compelled by governments to be handed over" | p.597 |
| Protect privacy proactively, like a national park | organizational priorities | otherwise "the tragedy of the commons"; "Ubiquitous surveillance is not inevitable. We are still able to stop it." | p.597 |
| Treat societal impact as part of the engineering job | professional role | "if we don't consider the societal impact of our work, we're not doing our job" | p.597 |

## Metrics and numbers

The chapter is qualitative; it gives principles and legal wording, not numeric thresholds. Rows below capture every quantity-like statement.

| metric or quantity | definition / how measured | values or thresholds the book gives | caveats | page |
|---|---|---|---|---|
| Decision cost asymmetry | cost of a false refusal vs a false acceptance from the organization's view | "the cost of a missed business opportunity is low, but the cost of a bad loan or a problematic employee is much higher" | drives systematic exclusion of individuals ("algorithmic prison") | p.586 |
| Population statistic vs individual | what an average says about one person | average life expectancy of 80 years "doesn't mean you're expected to drop dead on your 80th birthday" | prediction outputs are probabilistic; individual cases may be wrong | p.588 |
| Algorithmic pricing effect | change in competition and prices after algorithms set prices | German gas stations: "competition was reduced and prices for consumers went up because the algorithms learned to collude" | one empirical study cited; no percentages quoted | p.589 |
| Sensor density | internet-connected microphones per inhabited space | "every inhabited space contains at least one internet-connected microphone" (approaching) | includes phones, TVs, assistants, baby monitors, toys | p.590 |
| Side-channel inference accuracy | recovering typed text from smartwatch motion sensors | "fairly good accuracy" for passwords | accuracy "only going to get better" | p.591 |
| GDPR consent validity criteria | conditions for consent to count | "freely given, specific, informed, and unambiguous"; "refuse or withdraw consent without detriment"; "intelligible and easily accessible form, using clear and plain language"; "silence, pre-ticked boxes or inactivity [do not] constitute consent" | binary legal test, not a score | p.592 |
| GDPR purpose limitation and data minimization | constraints on collection and use | "collected for specified, explicit and legitimate purposes and not further processed in a manner that is incompatible"; "adequate, relevant and limited to what is necessary" | conflicts with exploratory big-data use | p.596 |
| Enforcement strength | degree to which GDPR is enforced | "weakly enforced"; "some effect on the online advertising industry" | no fines or counts given | p.596 |
| Breach frequency | how often collected data leaks | "breaches happen disconcertingly often" | qualitative | p.594 |
| Startup valuation basis | what investors count | "user numbers, or 'eyeballs'--that is, by their surveillance capabilities" | polemical framing | p.594 |
| Retention bound | how long to keep data | "not retain data forever, but purge it as soon as it is no longer needed" | no fixed period; tie to stated purpose | p.597 |
| Time to safeguards (historical) | delay between Industrial Revolution harms and regulation | "It took a long time before safeguards were established" | analogy only | p.595 |

## Failure modes and anti-patterns

| failure mode | cause | consequence | mitigation the book gives | page |
|---|---|---|---|---|
| Algorithmic prison | risk-averse automated refusals accumulated across institutions | exclusion from jobs, travel, insurance, housing, finance "without any proof of guilt, and with little chance of appeal" | presumption of innocence; appeal routes; human accountability | p.586 |
| Bias amplification | biased historical data used as training input | system learns and amplifies the bias; patterns are opaque | audit inputs; human moral imagination; do not assume fairness | p.587 |
| Proxy discrimination | features correlated with protected traits (postal code, IP address) | prohibited discrimination laundered through the model | check correlations; "money laundering for bias" warning | p.587 |
| Unaccountable decisions | blaming the algorithm; opaque ML scoring | no recourse; cannot explain to a judge | named accountability; explainability | p.587 |
| Stereotyping and wrong bucket | predictive analytics based on "people like you" | individuals misjudged; erroneous data gives "almost impossible" recourse | base on relevant personal facts; correction mechanisms | p.587-588 |
| Probabilistic output treated as certain | statistical nature of data ignored | individual decisions wrong | treat as probabilistic | p.588 |
| Predatory targeting | analytics revealing vulnerability | selling risky products to vulnerable people | use the power for aid; prevent harmful use | p.588 |
| Echo chambers | recommenders optimizing for agreement | polarization, misinformation, election impact | consider systemic effects of recommendations | p.588 |
| Credit-score hiring spiral | credit scores used by employers | misfortune to joblessness to poverty to worse score | systems thinking; question "poisonous assumptions" | p.588-589 |
| Algorithmic collusion | pricing algorithms interacting | reduced competition, higher prices | systems thinking; monitor the whole system | p.589 |
| Service acquires its own interests | behavioral tracking as a side effect | conflicts with the user's interests | separate explicit data from tracking; justify each tracking use | p.589 |
| Advertising inversion | ad-funded business model | advertisers become the customers; detailed, long-retained profiles; "surveillance" | question whether tracking is "necessary only because the ads pay for the service" | p.589-591 |
| Insecure always-on devices | IoT microphones and cloud speech recognition | "terrible security record"; mass surveillance infrastructure | treat as high-risk | p.590 |
| Surveillance deciding life outcomes | car driving data shared without consent, fitness trackers | insurance premiums and coverage depend on surveillance | consent; limits on use | p.591 |
| Sensor side channels | motion sensors in smartwatches | typed passwords inferred | expect sensors and algorithms to improve; limit collection | p.591 |
| Meaningless consent | obscure policies; incomprehensible derived datasets; data about non-users | users "cannot give meaningful consent" | plain language; explain processing; minimize | p.591 |
| Invalid consent under GDPR | pre-ticked boxes, inactivity, detriment on refusal | consent not "freely given" | meet the quoted GDPR criteria | p.592 |
| Illusory freedom of choice | essential services, network effects, gambling mechanics | surveillance "becomes inescapable" for the less privileged | do not rely on the opt-out argument | p.592 |
| "Privacy is dead" fallacy | confusing privacy with secrecy | erosion of the decision right | privacy as freedom to choose what to reveal to whom | p.592-593 |
| Privacy right transferred to the company | "Trust us to do the right thing with your data" | company decides disclosure to maximize profit; users lose agency | hand control back to users | p.593 |
| Creepy or painful insights | algorithms oblivious to human needs | factually correct output harms the user | handle wrong, undesirable or inappropriate data; humility | p.593 |
| Perception management instead of restraint | avoiding looking creepy rather than being less intrusive | intrusion continues unseen | address actual intrusiveness | p.593 |
| Privacy settings theater | settings only limit other users | service keeps "unfettered access" and internal rights | constrain internal processing too | p.593-594 |
| "Data exhaust" framing | treating behavioral data as waste | justifies unlimited extraction | recognize data as labor and asset | p.594 |
| Toxic asset exposure | hoarded personal data | breaches, government compulsion, bankruptcy sales, insider leaks, regime change | minimize; purge; weigh benefits vs risks | p.594-595 |
| Power asymmetry | scrutinizing others while avoiding scrutiny | unaccountable power over people's lives | transparency and public oversight | p.595 |
| Big-data maximalism | maximize collection, combine, explore | violates purpose limitation; "unforeseen purposes" | specified purposes; minimization | p.596 |
| Enforcement complacency | GDPR weakly enforced | culture and practices unchanged | self-regulation | p.596 |
| Overregulation | blanket restriction, e.g. on medical data | lost diagnostics and treatments | balance opportunities and risks | p.596 |
| Users as metrics | optimizing engagement numbers | loss of respect, dignity, agency | culture shift | p.596 |
| Indefinite retention | default keep-everything | exposure to leak, theft, compulsion | purge when no longer needed | p.597 |
| Tragedy of the commons | nobody protects privacy explicitly | privacy "will be destroyed" | explicit protection and care | p.597 |

## Elicitation questions

1. Does any part of this system make or shape decisions about individual people (approve, deny, rank, price, flag, hire)? [predictive analytics scope, p.586]
2. If someone is wrongly flagged or refused, how do they find out, challenge it, and get it fixed, and which named person is accountable? [accountability and appeal, p.586-587]
3. Could you explain to a regulator or a judge why the system made one specific decision? [explainability, p.587]
4. Which of your inputs could stand in for protected characteristics (postcode, IP address, name, device, neighborhood)? [proxy discrimination, p.587]
5. Where does the historical data come from, and were the past decisions in it fair? [bias in training data, p.587]
6. How will you measure whether different groups get different outcomes, and what will you do if they do? [bias auditing, p.587]
7. Does a low score here feed other systems (hiring, insurance, housing) in a way that could trap someone in a spiral? [feedback loops, p.588-589]
8. Are prices or recommendations set by algorithms that could reinforce each other or lock users into what they already believe? [algorithmic collusion, echo chambers, p.588-589]
9. Which data do users give you on purpose, and which do you collect as a by-product of their activity (clicks, location, device, time on page)? [explicit data vs tracking, p.589]
10. For each tracked item, which user-facing feature does it improve, and would you still collect it if there were no advertising? [necessity of tracking, p.589, p.591]
11. Who pays for the service, users or advertisers, and whose interests win when they conflict? [business model inversion, p.589-590]
12. Does your data reveal things about people who are not your users (contacts, household members, bystanders)? [non-user data, p.591]
13. For each kind of personal data, which legal basis do you rely on (consent, legal obligation, protecting life, legitimate interest)? [lawful basis, p.592]
14. How do people give consent: a clear, un-pre-ticked choice they can refuse or withdraw while still using the service? [GDPR consent, p.592]
15. Can a user see in plain language what you hold about them and how it is used, including profiles you derived? [transparency, educating users, p.591, p.596-597]
16. Can users choose what to reveal to whom per situation, e.g. share health data with researchers but not insurers? [privacy as decision right, p.593]
17. Do your privacy settings limit what your own company does with the data internally, or only what other users see? [internal use limits, p.593-594]
18. For each dataset, what is the stated purpose, how long is it needed, and when exactly is it deleted? [purpose limitation, retention, deletion, p.596-597]
19. Who would get this data if you were breached, acquired, went bankrupt, or received a legal demand, and what harm would follow? [toxic asset, p.594-595]
20. Would you be comfortable with a future government of different values holding this data? [future governments, p.595]
21. Does your app or device keep a microphone, camera or location sensor active in the background? [always-on sensors, p.590]
22. Does the product use streaks, rewards or other game-like hooks to keep people coming back, and is that in their interest? [engagement mechanics, p.592]
23. Which numbers do you optimize, and do any of them treat users as counts rather than people? [users as metrics, p.596]
24. Could an insight or reminder you show be painful or inappropriate even if accurate, and how will you handle that? [inappropriate outputs, p.593]
25. Is the data you want to collect essential to the service, or is it collected because it might be useful someday? [data minimization vs exploration, p.596-597]

## Verifiable properties

| property | how to test | page |
|---|---|---|
| Every personal-data store has a declared purpose and retention limit | catalog check in CI: any table, bucket, log or index tagged as personal data without purpose and max-age fails | p.596-597 |
| Retention is enforced | insert a record with a backdated timestamp beyond the limit, run the purge job, assert the record is gone | p.597 |
| Deletion propagates to derived data | delete a test user, then assert absence in primary store, search index, caches, warehouse, analytics exports and ML training sets | p.591, p.597 |
| Consent is recorded before consent-based processing | each processing job checks for a consent record (timestamp, purpose, text version); processing a user without one is refused in a test | p.592 |
| No pre-ticked consent | UI test asserts consent controls default to unchecked and that doing nothing grants no consent | p.592 |
| Withdrawal without detriment | withdraw consent for a test user; the related processing stops and the core service still works | p.592 |
| Consent text is plain and accessible | readability check of the consent copy against a team-chosen reading level; link to full details reachable in one step | p.592 |
| Lawful basis documented per processing activity | registry entry (consent, legal obligation, vital interest, legitimate interest) required for each pipeline; build fails if missing | p.592 |
| Purpose compatibility of consumers | each downstream job declares purposes; static check that they are compatible with the purposes tagged on its input fields | p.596 |
| Data minimization | diff of fields collected against fields read by any feature; unused collected fields trigger an alert | p.596-597 |
| Non-user data handled | pipeline test that contact lists or bystander data are rejected or anonymized before storage | p.591 |
| Protected-trait proxies flagged | compute correlation of each model feature with protected attributes on a test set; fail above a chosen threshold | p.587 |
| Outcome disparity monitored | compare decision rates across groups on synthetic and live data; alert on disparity | p.587 |
| Every decision is explainable | for any decision ID an API returns the inputs and reasons; test coverage over 100 percent of decision types | p.587 |
| Correction path works | submit a correction to an erroneous fact; stored fact changes and the decision is recomputed | p.587-588 |
| User data export is complete | export for a test user includes every field in the catalog, including derived profiles and scores | p.591, p.596-597 |
| Background sensor access is off | automated check of permission audit logs that microphone and location are not accessed while the feature is inactive | p.590 |
| Score distributions do not drift toward self-reinforcement | track cohort score distributions over time; alert when a cohort's scores fall monotonically after a decision | p.588-589 |
| Tracking events are purged | behavioral event logs older than the retention window are absent after the purge job | p.589, p.597 |
| Personal data inventory is complete | scanner finds no unregistered store containing personal identifiers | p.594-595 |

## Terms

- **predictive analytics**: using data to predict individual behavior (reoffending, default, claims) and act on it (p.586).
- **algorithmic prison**: systematic exclusion from jobs, travel, insurance, housing and finance by automated "no" decisions, without proof of guilt or appeal (p.586).
- **protected traits**: ethnicity, age, gender, sexuality, disability, beliefs; anti-discrimination law forbids treating people differently on them (p.587).
- **proxy feature**: a non-protected input (postal code, IP address) that strongly predicts a protected trait (p.587).
- **bias amplification**: a model learning and strengthening a systematic bias present in its input data (p.587).
- **"money laundering for bias"**: satirical name for believing biased data yields fair algorithmic output (p.587).
- **moral imagination**: the human capacity to want a future better than the past, which models cannot supply (p.587).
- **accountability**: a human who answers for an algorithm's mistakes and can be appealed to (p.587).
- **credit score vs predictive score**: "How did you behave in the past?" versus "Who is similar to you?" (stereotyping) (p.588).
- **feedback loop**: a decision changing the data that drives the next decision, e.g. credit score to joblessness to worse score (p.588-589).
- **echo chamber**: recommendations that show only agreeable content, breeding polarization (p.588).
- **algorithmic collusion**: pricing algorithms learning to raise prices together, reducing competition (p.589).
- **systems thinking**: analyzing the whole system including people and their responses to it (p.589).
- **behavioral data / tracking**: activity logged as a side effect of use rather than entered deliberately (p.589).
- **A/B test and user flow analysis**: tracking-based techniques that improve a UI (p.589).
- **surveillance**: tracking that primarily serves the collector or its advertisers rather than the user (p.590).
- **"nothing to hide"**: argument that presumes alignment with existing power structures (p.590).
- **consent**: under GDPR must be freely given, specific, informed, unambiguous and withdrawable without detriment (p.592).
- **GDPR**: EU General Data Protection Regulation (2016/679), source of the consent, purpose limitation and minimization rules quoted (p.592, p.596).
- **lawful basis**: grounds for processing personal data: consent, legal compliance, protecting life, legitimate interest, among others (p.592).
- **legitimate interest**: GDPR basis allowing uses such as fraud prevention without consent (p.592).
- **network effects**: value of a service rising with its users, making opting out socially costly (p.592).
- **privacy**: a decision right: the freedom to choose what to reveal to whom, between secrecy and transparency (p.592-593).
- **privacy policy**: the document setting the terms, which often obscures rather than illuminates (p.591).
- **privacy settings**: user controls over what other users see; do not limit the service itself (p.593).
- **data exhaust**: framing of behavioral data as worthless by-product, rejected by the authors (p.594).
- **data as labor**: view that ad-funded user activity is a form of work (p.594).
- **data broker**: company that buys, aggregates, analyzes and resells personal data (p.594).
- **eyeballs**: user counts as a valuation basis, i.e. surveillance capability (p.594).
- **toxic asset / hazardous material / new uranium**: metaphors for personal data's risk of leaks, theft and compulsion (p.594).
- **civic hygiene**: Schneier's term for not installing technology that could facilitate a police state (p.595).
- **data as pollution**: Schneier's framing of data as the information age's environmental problem (p.596).
- **purpose limitation**: data collected for specified, explicit, legitimate purposes and not processed incompatibly (p.596).
- **data minimization**: data adequate, relevant and limited to what is necessary (p.596).
- **self-regulation**: the industry constraining its own collection and processing to keep users' trust (p.596).
- **tragedy of the commons**: destruction of a shared good (privacy) when nobody explicitly protects it (p.597).
- **ACM Code of Ethics and Professional Conduct**: a professional guideline rarely applied in practice (p.585).

## Chapter summary (condensed)

- The book's final summary opens by recapping the ground covered, chapter by chapter (p.597-598):
- Ch 1 contrasted analytical and operational systems, cloud vs self-hosting, distributed vs single-node, and balancing business needs with user needs; Ch 2 defined nonfunctional requirements: performance, reliability, scalability, maintainability (p.597).
- Ch 3 covered relational, document and graph models, event sourcing and DataFrames, with SQL, Cypher, SPARQL, Datalog and GraphQL; Ch 4 covered OLTP storage engines (LSM-trees, B-trees), column-oriented analytics storage, and full-text and vector indexes (p.597).
- Ch 5 covered encoding and schema evolution, and dataflow via databases, service calls, workflow engines and event-driven architectures; Ch 6 covered single-leader, multi-leader and leaderless replication, read-after-write consistency and sync engines for offline clients (p.597).
- Ch 7 covered sharding, rebalancing, request routing and secondary indexes; Ch 8 covered transactions, durability, isolation levels and atomicity in distributed transactions (p.597-598).
- Ch 9 surveyed network faults, clock errors, process pauses and crashes, and why even a lock is hard; Ch 10 went deep into consensus and linearizability (p.598).
- Ch 11 built batch processing up from Unix tools to distributed batch processors on distributed filesystems or object stores; Ch 12 generalized to stream processing with message brokers, CDC, fault tolerance and streaming joins (p.598).
- Ch 13 explored a philosophy of streaming systems that lets disparate systems be integrated, systems evolved, and applications scaled more easily (p.598).
- The final chapter steps back to the ethics of building data-intensive applications (p.598).
- Data can do good but can also do significant harm: decisions that seriously affect people's lives and are hard to appeal; discrimination and exploitation; normalizing surveillance; exposing intimate information (p.598).
- There is also the risk of data breaches, and well-intentioned uses of data may have unintended consequences (p.598).
- Given the large impact of software and data on the world, engineers carry a responsibility to work toward the world they want to live in, one "that treats people with humanity and respect", and the authors close with a call to "work together toward that goal" (p.598).

## Second-edition-specific

Identified from the text itself (chapter structure and references dated after the 2017 first edition); a side-by-side comparison with the first edition was not part of the source files, so treat these as "looks new".

- Ethics is now a standalone Chapter 14 rather than a closing section, with a new epigraph from Prabhu and Birhane (2020) about feeding AI systems "the world's beauty, ugliness, and cruelty" (p.585).
- Framing broadened from "big data" to "big data and AI" and "predictive analytics and AI systems" (p.586-587).
- Ethics defined as "a participatory and iterative process of reflection ... with accountability", citing Steen (2023), Johnson and Verdicchio (2023) and Green (2019) (p.586).
- "Human dignity is paramount", citing Schmudde (2024) (p.585).
- New feedback-loop example: German gas stations' algorithmic prices "learned to collude" (Assad et al., 2024) (p.589).
- New surveillance example: cars tracking driving behavior "without drivers' consent" affecting insurance premiums (FTC action against General Motors, 2025) (p.591).
- GDPR treated as in force with quoted consent criteria, the legitimate-interest basis, purpose limitation and minimization wording, plus an assessment that it "has been weakly enforced" with only "some effect on the online advertising industry" (Wang et al. 2023; Ryan 2023) (p.592, p.596).
- Gambling-style engagement mechanics cited from Tristan Harris (TED 2017) (p.592).
- "Data as labor" argument (Arrieta Ibarra et al., 2018) and "data is the new uranium" (Pesce, 2024) added to the toxic-asset discussion (p.594).
- Healthcare AI racism reference (Nichols, 2020) and FTC joint statement on bias in automated systems (2023) support the bias section (p.587).
- "Digital pollution" references (Estrin and Gill, 2019) extend the Industrial Revolution analogy (p.595).
- Closing call to action quotes Jez Humble (2021): excluding societal impact "means you're not doing your job" (p.597).
- The whole-book recap reflects the 2nd-edition structure: DataFrames, vector search, workflow engines, event-driven architectures, sync engines and cloud vs self-hosting (p.597-598).
