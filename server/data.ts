// All data in this file is SYNTHETIC, generated from scratch for the COSTERA bounty demo.
// Fictional telco: ZephyrTel. No real customer, provider, network or employer data.

export interface Ticket {
  id: string;
  createdAt: string;
  channel: "chat" | "email" | "phone";
  customer: string;
  text: string;
}

export interface Plan {
  name: string;
  kind: "plan" | "add-on";
  data?: string;
  price: number;
  notes: string;
}

export interface Outage {
  id: string;
  area: string;
  service: string;
  status: "active" | "resolved";
  started: string;
  resolved?: string;
  note: string;
}

export interface Account {
  handle: string;
  plan: string;
  balance: number;
  status: string;
  dueDate: string;
}

export const TELCO = "ZephyrTel";
export const BATCH_LABEL = "Synthetic batch · 12–14 Nov 2026";

export const PLANS: Plan[] = [
  {
    name: "Core 30",
    kind: "plan",
    data: "30 GB",
    price: 30,
    notes: "Entry plan. Plan changes take effect next billing cycle.",
  },
  {
    name: "Streamline 60",
    kind: "plan",
    data: "60 GB",
    price: 60,
    notes:
      "Advertised $60/month. Changes mid-cycle may produce a proration adjustment in the change month.",
  },
  {
    name: "Basic 10",
    kind: "plan",
    data: "10 GB",
    price: 10,
    notes: "Legacy plan, no longer sold.",
  },
  {
    name: "Roam Plus",
    kind: "add-on",
    price: 15,
    notes:
      "Travel add-on. Activate in Account → Add-ons before travel; $15/month, cancels anytime.",
  },
];

export const OUTAGES: Outage[] = [
  {
    id: "OUT-2071",
    area: "Riverside",
    service: "mobile data",
    status: "active",
    started: "2026-11-12",
    note: "Synthetic storm damage to an aggregation node; field crew dispatched.",
  },
  {
    id: "OUT-2069",
    area: "Hillcrest",
    service: "mobile data",
    status: "resolved",
    started: "2026-11-08",
    resolved: "2026-11-10",
    note: "Synthetic fiber cut, repaired and verified.",
  },
];

export const ACCOUNTS: Account[] = [
  { handle: "cust_014", plan: "Core 30", balance: 12.5, status: "active", dueDate: "2026-11-20" },
  { handle: "cust_022", plan: "Core 30", balance: 0, status: "active", dueDate: "2026-11-25" },
  { handle: "cust_031", plan: "Streamline 60", balance: 60, status: "active", dueDate: "2026-11-18" },
  { handle: "cust_041", plan: "Streamline 60", balance: 100, status: "active", dueDate: "2026-11-16" },
];

export const PROCEDURES: Record<string, string> = {
  sim_swap:
    "Replacement SIMs are issued at any ZephyrTel service point (synthetic). Bring account-holder ID; the old SIM is deactivated on swap.",
  roaming:
    "Activate Roam Plus in Account → Add-ons before travel. $15/month, cancels anytime.",
};

export const TICKETS: Ticket[] = [
  {
    id: "ZT-1001",
    createdAt: "2026-11-12T09:14:00+08:00",
    channel: "chat",
    customer: "cust_041",
    text: "I switched to Streamline 60 on the 1st and my bill jumped by $40. Nobody told me about a proration charge.",
  },
  {
    id: "ZT-1002",
    createdAt: "2026-11-12T10:02:00+08:00",
    channel: "email",
    customer: "cust_052",
    text: "Changed my plan to Streamline 60 last week. The new bill is way higher than the $60 advertised. Why?",
  },
  {
    id: "ZT-1003",
    createdAt: "2026-11-12T11:20:00+08:00",
    channel: "chat",
    customer: "cust_063",
    text: "No mobile data at all in Riverside since the storm on Tuesday. Calls work, data is dead.",
  },
  {
    id: "ZT-1004",
    createdAt: "2026-11-12T13:45:00+08:00",
    channel: "chat",
    customer: "cust_014",
    text: "Hi, can you check my account balance? Handle cust_014.",
  },
  {
    id: "ZT-1005",
    createdAt: "2026-11-12T15:10:00+08:00",
    channel: "phone",
    customer: "cust_071",
    text: "After moving to Streamline 60 I got charged twice this month. One full bill plus a partial one.",
  },
  {
    id: "ZT-1006",
    createdAt: "2026-11-13T08:30:00+08:00",
    channel: "email",
    customer: "cust_088",
    text: "Data keeps dropping in the Riverside district. Started after the storm. Three of my neighbours have the same issue.",
  },
  {
    id: "ZT-1007",
    createdAt: "2026-11-13T09:05:00+08:00",
    channel: "chat",
    customer: "cust_022",
    text: "Which plan am I currently on? I think it's Core 30 but I'm not sure.",
  },
  {
    id: "ZT-1008",
    createdAt: "2026-11-13T10:40:00+08:00",
    channel: "chat",
    customer: "cust_095",
    text: "My first Streamline 60 bill includes a weird one-off fee. The plan page said $60 flat.",
  },
  {
    id: "ZT-1009",
    createdAt: "2026-11-13T11:15:00+08:00",
    channel: "phone",
    customer: "cust_103",
    text: "Riverside area, zero data since Tuesday's storm. My router lights are fine, it's the network.",
  },
  {
    id: "ZT-1010",
    createdAt: "2026-11-13T12:00:00+08:00",
    channel: "email",
    customer: "cust_110",
    text: "Is the Hillcrest outage fixed? My data came back yesterday but I want to confirm.",
  },
  {
    id: "ZT-1011",
    createdAt: "2026-11-13T14:25:00+08:00",
    channel: "chat",
    customer: "cust_127",
    text: "Upgraded to Streamline 60 and now there's an extra $40 'adjustment' on my bill. Explain please.",
  },
  {
    id: "ZT-1012",
    createdAt: "2026-11-13T16:00:00+08:00",
    channel: "chat",
    customer: "cust_031",
    text: "When is my next bill due? Account cust_031.",
  },
  {
    id: "ZT-1013",
    createdAt: "2026-11-14T08:10:00+08:00",
    channel: "email",
    customer: "cust_134",
    text: "Still no data in Riverside. It's been two days since the storm. When will it be restored?",
  },
  {
    id: "ZT-1014",
    createdAt: "2026-11-14T09:00:00+08:00",
    channel: "chat",
    customer: "cust_142",
    text: "I'm travelling next week. How do I activate Roam Plus on my line?",
  },
  {
    id: "ZT-1015",
    createdAt: "2026-11-14T09:30:00+08:00",
    channel: "chat",
    customer: "cust_150",
    text: "Everything is bad. Fix it.",
  },
  {
    id: "ZT-1016",
    createdAt: "2026-11-14T10:05:00+08:00",
    channel: "phone",
    customer: "cust_168",
    text: "Since I changed to Streamline 60 the bill is wrong. It should be $60, I'm seeing $100.",
  },
  {
    id: "ZT-1017",
    createdAt: "2026-11-14T10:30:00+08:00",
    channel: "email",
    customer: "cust_175",
    text: "I want a refund for the extra charge on this month's bill. I never agreed to it.",
  },
  {
    id: "ZT-1018",
    createdAt: "2026-11-14T11:00:00+08:00",
    channel: "chat",
    customer: "cust_183",
    text: "Riverside, data completely gone after the storm. Calls and SMS still work.",
  },
  {
    id: "ZT-1019",
    createdAt: "2026-11-14T11:20:00+08:00",
    channel: "chat",
    customer: "cust_190",
    text: "My SIM stopped working after I dropped my phone in water. How do I get a replacement SIM?",
  },
  {
    id: "ZT-1020",
    createdAt: "2026-11-14T11:45:00+08:00",
    channel: "phone",
    customer: "cust_201",
    text: "I have a problem with the thing from last week. You know what I mean. It's still not right.",
  },
  {
    id: "ZT-1021",
    createdAt: "2026-11-14T12:10:00+08:00",
    channel: "email",
    customer: "cust_214",
    text: "Please credit my account for the days without service in Riverside. I shouldn't pay for downtime.",
  },
  {
    id: "ZT-1022",
    createdAt: "2026-11-14T12:30:00+08:00",
    channel: "email",
    customer: "cust_041",
    text: "Following up on my chat two days ago: the $40 jump after switching to Streamline 60 is still on my bill.",
  },
];