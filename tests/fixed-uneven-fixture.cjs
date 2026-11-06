// Entirely fictional participants and a generated schedule for constrained doubles tests.
module.exports = {
  "input": {
    "date": "2030-01-05",
    "membershipPeriod": "synthetic-2030",
    "players": [
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "f1",
      "f2",
      "f3",
      "f4",
      "guest-2030-01-05-01",
      "guest-2030-01-05-02",
      "guest-2030-01-05-03"
    ],
    "fixedPlayerIds": [
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "f1",
      "f2",
      "f3",
      "f4"
    ],
    "profiles": {
      "m1": {
        "name": "Synthetic Player 1",
        "gender": "male",
        "memberType": "fixed"
      },
      "m2": {
        "name": "Synthetic Player 2",
        "gender": "male",
        "memberType": "fixed"
      },
      "m3": {
        "name": "Synthetic Player 3",
        "gender": "male",
        "memberType": "fixed"
      },
      "m4": {
        "name": "Synthetic Player 4",
        "gender": "male",
        "memberType": "fixed"
      },
      "m5": {
        "name": "Synthetic Player 5",
        "gender": "male",
        "memberType": "fixed"
      },
      "f1": {
        "name": "Synthetic Player 6",
        "gender": "female",
        "memberType": "fixed"
      },
      "f2": {
        "name": "Synthetic Player 7",
        "gender": "female",
        "memberType": "fixed"
      },
      "f3": {
        "name": "Synthetic Player 8",
        "gender": "female",
        "memberType": "fixed"
      },
      "f4": {
        "name": "Synthetic Player 9",
        "gender": "female",
        "memberType": "fixed"
      },
      "guest-2030-01-05-01": {
        "name": "Synthetic Player 10",
        "gender": "male",
        "memberType": "guest"
      },
      "guest-2030-01-05-02": {
        "name": "Synthetic Player 11",
        "gender": "male",
        "memberType": "guest"
      },
      "guest-2030-01-05-03": {
        "name": "Synthetic Player 12",
        "gender": "male",
        "memberType": "guest"
      }
    },
    "quotas": {
      "m1": 4,
      "m2": 4,
      "m3": 4,
      "m4": 4,
      "m5": 4,
      "f1": 4,
      "f2": 4,
      "f3": 4,
      "f4": 4,
      "guest-2030-01-05-01": 4,
      "guest-2030-01-05-02": 4,
      "guest-2030-01-05-03": 4
    },
    "availability": {
      "m1": {
        "from": 1,
        "to": 6
      },
      "m2": {
        "from": 0,
        "to": 6
      },
      "m3": {
        "from": 0,
        "to": 6
      },
      "m4": {
        "from": 0,
        "to": 6
      },
      "m5": {
        "from": 0,
        "to": 4
      },
      "f1": {
        "from": 0,
        "to": 4
      },
      "f2": {
        "from": 0,
        "to": 4
      },
      "f3": {
        "from": 0,
        "to": 4
      },
      "f4": {
        "from": 0,
        "to": 6
      },
      "guest-2030-01-05-01": {
        "from": 0,
        "to": 6
      },
      "guest-2030-01-05-02": {
        "from": 0,
        "to": 6
      },
      "guest-2030-01-05-03": {
        "from": 0,
        "to": 6
      }
    },
    "lockedPairs": [],
    "allowPartnerRepeats": false,
    "avoidConsecutiveRests": true,
    "theme": "club",
    "allowFixedUnevenDoubles": true
  },
  "rounds": [
    [
      [
        "f3",
        "m5"
      ],
      [
        "f4",
        "guest-2030-01-05-01"
      ],
      [
        "f1",
        "guest-2030-01-05-03"
      ],
      [
        "f2",
        "m2"
      ]
    ],
    [
      [
        "f3",
        "m1"
      ],
      [
        "m3",
        "m5"
      ],
      [
        "f1",
        "m4"
      ],
      [
        "f2",
        "guest-2030-01-05-02"
      ]
    ],
    [
      [
        "guest-2030-01-05-01",
        "m5"
      ],
      [
        "guest-2030-01-05-03",
        "m2"
      ],
      [
        "f1",
        "f2"
      ],
      [
        "f3",
        "f4"
      ]
    ],
    [
      [
        "f2",
        "m3"
      ],
      [
        "m1",
        "m5"
      ],
      [
        "f1",
        "guest-2030-01-05-02"
      ],
      [
        "f3",
        "m4"
      ]
    ],
    [
      [
        "guest-2030-01-05-01",
        "guest-2030-01-05-03"
      ],
      [
        "guest-2030-01-05-02",
        "m3"
      ],
      [
        "f4",
        "m4"
      ],
      [
        "m1",
        "m2"
      ]
    ],
    [
      [
        "guest-2030-01-05-01",
        "m3"
      ],
      [
        "guest-2030-01-05-02",
        "guest-2030-01-05-03"
      ],
      [
        "f4",
        "m1"
      ],
      [
        "m2",
        "m4"
      ]
    ]
  ]
};
