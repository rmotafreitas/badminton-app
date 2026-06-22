import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizePhone } from "../src/application/utils/normalizePhone";

const prisma = new PrismaClient();

type SeedRole = "SYSTEM_ADMIN" | "CLUB_ADMIN" | "COACH" | "PLAYER";

interface Member {
  name: string;
  phone?: string;
  email?: string;
  roles: SeedRole[];
  photo?: string;
}

const members: Member[] = [
  {
    name: "Ricardo Freitas",
    email: "rmotafreitas@gmail.com",
    phone: "+351 967 083 100",
    roles: ["CLUB_ADMIN", "PLAYER"],
    photo:
      "data:image/webp;base64,UklGRggDAABXRUJQVlA4IPwCAADQEgCdASpgAGAAPtFap0yoJSOoLHbboQAaCWUAzJc2Rg/pj2jjfBil6HXw5d/vNNyiItIsdrZKRMvNeCZRhck45KzokT6in40SxL0UakrifGRfOr99CAaUscLnHtPFFQqmKGusOPaDz8FCah5XrdDiAKAPmkx4JXcMeRz/ySzFB6lYPP6ZS1vuGs5dfnKyhfkoAahPv9uUcDsYjK7k/AAA/vD3dERGGimzJ9Bv4ZlsDCgFExlcEJOp16qKF9XTbHbPRDpQY+QPjbKrQeprYAhVWwnP6ez/ejnLXXwc5t+1w9qNgiSmOxRpnatQCPqofNWwVrVYm/44K782aaP9zV08dssENkF3cOXhgFsUlmhe7Bat5g48+4VbG5vspsoG6BjRxouiWA/cC41alNbyOnW+Hw8lRXkjouqOl1xyf8jTGSFoinpS4Jj+4lmsXD/6YMQEI0OTmgz45QUcD1igxD3jlGw4WcD3YMgKEeu3kHFY6N9C8DGYqRo3lQkcP0aYXvMop91jmkLLS15RsqcaJQRmfSFZLKeDZ55vMYjH9ThTOHPYLJo+TuAaBLpJ3GxXUFBX6jspOXjPXlcTTfAaJmcLTvdJJTDAQHYDfC54qWQaOfzks0eut9Am6t57div7Q4zW5LweFg90rirPPmNwlek8A5NhjV6tPtcKOYda24gWx2YqihRksZuih2e73KW+ZnGrQDM0G1hL4p4YrgHoRKTIVxFtkPYw75TUPbssmt8grAzwNSwQuELmAHh1R6E+J7UrkMA9UzLan7lkSKXNdGAo2wShWDOb2p1K4kI4n9aiHObyYq6E2DTSdNB2pbWdhJGY6//WKk9vWRnvVA/sKP9TeTAUrf1GhFvJcGIc8bZL5AFjWc5IApRcLIcvlgFkMeTkh6FmeVLz2uw/YUinWVWhWYLz+EF87bk/PCncaNPS62RIMTaMfSlCRHFamv25ukeO/B/qZknynvjICSMk3VO2BOnb80Ay+yDgxhnBYVRdDUyO5wGfp8kRdZgAAA==",
  },
  {
    name: "Marco Pinho",
    phone: "+351 913 004 577",
    roles: ["CLUB_ADMIN", "PLAYER"],
    photo:
      "data:image/webp;base64,UklGRqIEAABXRUJQVlA4IJYEAADQGACdASpgAGAAPtFYpkyoJSQirHJNcQAaCUAX/Ilp2QyeJZETGyXhKfQvc8we8lMDb362VrWjeN2ZygLT1NgXyOJfV2ls9Ano7CHPXNpf1hvrDxxMjQwUy5xZbVE/dA6oWHcmxDFEYZ1Qf55neHtptl5dWwTSUHG71T74SgEo3Pxh3riVvGkFcnmGQy+fmOVy8KpAuD/e80gUUqYO0qEzqEjsGyMZe4NCJXB4Tmu+Bv/sXVAsQDXq79JO/wLc/NCGRjyfw/5M4f5XHWtH5CAA/nA+YCssnW7FaJYfm3I19HP5HQhdhyyK+5R97cQEAMNMMG8ko4qITu+prkuVoi5/aCuYHDNmV+RnV72f6Mzzku6KA4VEt4gNMa5yM7WaG17qdY3Z3N4t4qaLuMwlBj8T7Ls5wi9SznodltF+WtU6fivZUPoz4ClP222nwslWW+1bSGRxLNUVHGOcZPSxpimMkdFtLPzI8v0UlxHZdCCDuDlYXggIUTVjAaXfUjIaE0Km/u3bOVRZ4tCAj8tRZ6SVLkZlJG/KnKEGSrLGT+1HLWce8qZlBTJaFkgRNs47E+rwZ+MWEzXB35dlnSrRpFapyQJFK5UjlwMLAhCiqKDDyWRIaJNXgpslo9Q4DTEWIXZ9pnkcGgQf/Akz9WZCX1p3sW71piS2kguMv+VsxsJ2w79qVrnS8cBdgh6RzgsgiRzook7oKMmq+pKgBL1SaTt9H4QVoKHZMl+zA1q7LXUhG5H+CUtjab2OH/JgJtMibpKEP47gUJDsCh1B1QIK0JO95Cv1+zIHZ21Y/AFmJj7IIvDMU+d3Y0n32X6NeiURGPlAF/c49krqvlh00MT13kupGxuc8nUDbk7/Flr8wnNfDfL6KXCvUO7Y6JTTXTTAP9Rp5Hrw4Q6OyQqa9XcJe3z+MyHCABJY0HPAnUrs3f43z7X148uUuA83f/LXTLdUjLGnnEpARWytTohKBa99YxCKDgMjr7y/e2oJxswJGINTnWpgh7h/DcK4tUqvHhOJBIU1buVdD5sbRx6LAa3m3H1sYq6Gzra8JTFueTAyqhKokzfk9di7/YxdXwR48UO+qDfaycULxTDHoFeWnXg9l/MUWft0cLxuQc30TBf93i7Ht5hJMT22gdA0OKVngtjyTxnGgZOD6u7n9nAsjPlF68dyrBJL335QYB2TbxU2zhMrjrB7Iy7KZkeOyjjuK0hhDCoWZFvosQBKXDSbeKFRqphciPnE/HAbcUyPFsiwsoB2FK/3Wt/REkxim7Dy4TQ9nbFSkJzbPuNVMMfKpLLJOGdfDMwTVDCyrdYnYyKva2g3BfZGVu1U5vOdGPiMgvyLzm2CYyRmz3DqK0XNXplmqaSnLq9nU9QnqpNGb+29ZWiRImTNS205JHZjYdXUPeTZb44W+VolI38QzMRlSVXXvikZfnf5V8JVM6nRVHo3KqpKSUNQgYx2LZIoF08AyPCoXCILtoZgqozmzVE723JXLkBuIQEvdb0Rxau/d2ITHAcQJrbXvr+SauS7N8kWMsAKwbDNX4vUjndVQkQjbBmNIUeSPuNzuAAA",
  },
  {
    name: "Antonio Silva",
    phone: "+351 910 945 110",
    roles: ["CLUB_ADMIN", "PLAYER"],
    photo:
      "data:image/webp;base64,UklGRu4EAABXRUJQVlA4IOIEAABQGwCdASpgAGAAPtFYpE2oJKMiLHW8AQAaCUAZxgVBjMmGZGE7Ht3w3MmcOsv/CQ2A6IwY6n37KTxKY1ym5d/xMxd0LGpU238aOxwWuhuVFjqINA3Dqdr3x+ufM2dGSZxxCt9nu6RSao3SJZjARfQRs/RNeN3HjbMmE2ZQkBDWyPUm9bzVq5b9A8iiLVraZxuchsOtnf6AFqE5n/tdad1FPNtwjpXuQt5R4ZQgBssBJUZrrQAV5crlydUeBOZ3WVKg1TgtpTzwmGPUxverFqC7PSmNFBgIr3hl22XFnXhuXC1kAAD+8QRO1o9rHaAxqPCPYabR/GgUx0fB1PA/KcaKfNe40IhiPPUbOK+/P5T/3uWosDYkX2ps8UH2nbxtWWubkzxJBDoJLzqET20i67Q6WbOi33ANPT8aQPQJHThiebWv0sSqpfFKLMPJin3/Awj12OQc8U2qFClHk4On2YVkXMYPBLa2X83scDstrttrkLKA95XLHzpvE0mYAKppBddAsanIS0Yz3gVisiuKpztHU2RgxSf7K4qMCvUqM7IaqEyyz0sUD7jxUKRDGYvl4Dy7iWkrg4MJX7UuB8CR+xqXGTT8budm85iMlXy0JFTAGTYx6yTh8MH/IzAxC4hWP3QEp4cD2+DTIQhVzORV1t6ygjU0kxZfMKM95m9xZnhBoCUCHaRwz4AoOmuGtwWqxGYgm3wtUaetaXIX7zkNpuNC6uQp2WDYeuGFXVIIz9dfZMNGyhTLH8HZ+2YVs250VBe7lkMbxXE19duixGqXtetGmIXTVRFExwjt0X5DQkN0WtPJ2lkrr9uiI+WDrpiTqyIUBdPnymRXbsNPBbuvhX2KHaM5JE5ZxBe0Du5ZecD9RhrQX+y1og4O7U0JWhZqgB/ndfYXyTejGJkI+dAyzelQcEiw0Zo0r9f5cYMgv/5MzHva9EUr60qREDpCe01pdzk2r+aHFnyOmWRCJI83gUB42oovt759cR02KGBr7ipEKq4t3BZ5bRodf9Rucoe96/LUGlmzGv7tA/9A8nHja6IxK1qXfCFFZBgBvUlGxT9fRLY9JlKy/Ht/oX9w5/WRDRz9vZTb7lZqpEB9DGksy/tXJ7qwlAkfYnL9Jnvdmga8JGrDxl/KwgZVwa15mEuddjGcjcgEiITGcq5J5o6jY3FHgKR6UCE6iNMnsn8Et0/XCxZ+QPacyYw7TJmw5L+ozVnzm9XXIeKd7WZT35x5JXkQTJduoZeIWqgNJeTg5rVy+3bbI4AFkXOzFV6c5szJ7przgLonTwu8IG0xWa7avnbGiW3mFdt45vbnJCRoGpY+PHgm70SmvCA+jzZd8ec4i9+28T0VoNbTY7FusnVobQ5Wf2TnqohOVJMCc9qqbwgvuy5T8QQYkSF+DksatifZv4DG2dH3KROZ1z67NOLrMDHyzXgHHlNpHrkWPmOcPHEiv0CFTmzYagsTWIozb1bdL4NoGWox7DevjGo1zc51Xd7A0bwVB4EbfM6u/EXsGhe3JM4AtTOauy37RZk3czI2w0QbewtVmWOpBrhnq3FJsaSd55BHKbQdswmrU0+zTxkt5cLV+WtHUaTlUnE9cMMPEOwKT2SLYnQfSHe30BHAgCtH7rcrgfafSAAJYPqUOO+Y8eVQUHG2NiWXVl6pbYnYtcgAAA==",
  },
  {
    name: "Margarida",
    phone: "+351 936 246 583",
    roles: ["CLUB_ADMIN", "PLAYER"],
    photo:
      "data:image/webp;base64,UklGRt4EAABXRUJQVlA4INIEAACwFwCdASpgAGAAPsFQoEunpK2hs5Xe2bAYCUAZyBDXNDUOcJY2UDfusByspJYKJxORRaCNInP68eJhsTmmrUQ8sq27yEazp+WPAdHVSS3ltbJfHkvWnPK9N/And1Dhb4/6uUE1kBqzSl/pnL6NN5lKEj6gION1jejYsXtaRRzW6RFcfA1TUHFPAhPbcBgVtUiCJ/aoTwus5/vJ9acvcU/B6iDZ/6x2tczLdgCDFtJdzRFarv3UI4au8goztZRiNucQpzg0xMAA/vgIaDURJ4SjFdubUcBXnHPwxILxwvVe5CfSmEIuQqGb2uPkQougY9trjl07n2nLSq+Vf/6DhdAtKCzLEfvfo43G5YwDCCqqDgX2m++/6O0PNjHPCzwkPnBN2x2by+JQMA1UZrdYN+4AfBXIFqKnYIeRTujWigTrG3dXwB+9MHmRf3cNum7UxhIiepSD13mtJxRjoG5GDcBJaNR/5e35SMVCExQ3EB5n8XOrMiP/Ga4hotIhUL8zx57yV1SKAnkXN42Iu/+pvMwTFym4lVJPubwoHpR/SnDTqq3tISHfMrcj5nzAi/IHZb0Ah4cTDXJj1XQPfiYBTMcDeE65y9XjQbe70WwVpLJNmymfVrpWLaN9C8QsHWD1azmK4dJJINuPfJ6PpOcsuT68oHR8HeZNQfzvKT1jx+HYWFxOri07bMP8BpasA6xiVsq4cmlkzdk+3O/Ff1WIrByHBl/nD2AJSlndUkIkFOn4gbtB2Hz2L3J0WnOjicWtMYZaLLaIt/s0TVmAAnRSfIdXA47mdGpS8o/8bDzEzNhdT5y7p5Zj6kBQDSUwVO1eCNvqS5CDPln4p72BWHUwXg7XuOpjLX3GmmAlsZ4VF7bLx8T7l2A4BF2WfY4Fv5JVwGNGaZEYEEyRMogswAexE8ZF4D9/AOxGbSRJ4da8EcOLbv2xKn8ATZAyN5bF8m81XIoWQC1eEE/vz7ddXYSAr74yTEDZHd1dX0GL+y6+zio9UriTM9RUk+mvWtgOIeQUzdaT4kW4uW/3yEmwfjRICcco+Oliu+nAmWVjdRKcrBe6RYhe9oo5RJzJcZgiJrQaiYCRWyjlLm7LXGo3CsTmT/hv94BksmVQt+b9WnlKh54Uk7qyYXbtnXuoOgXINNh3ZCVlqZ5v9/hf+8l8bsxIeBRt549z3lqJeUcgqNDWTSiCCAXcWSRBzAhZR/07P9cBp/I7MOEpFTIwIcHJXA/mlGvxYLOkj51aOPlceqegJThG/HBifLOFUw+ah3BnrvTp9UegdiTm7aW8ZhWcbTv82ipnpz9y6iZo0T5pw+Szca37AkiwoI+HgDo6zkCXonopZXlXez6zt7UJ3q2FLQpQJzrKPH9OFxAVX2nGb+opYqIDBSmhvaVgd66uwnLcJ1G9JWbzZHgL594HHobx7Tsh2pGqZP3FVIWPhrlAXqhflBI9cPw5axK5h+fLLuNjAtDzZ1RtRVxltGfgC9o8T6bMEFitkyTFBMpcWK7sDpAU5jsxd/U06xjvgQF1lGOnpQ46icZjLKQ8lWlJc22WLpgpzvtaWN493beEAwyrwDdbo+ep1wYDEUzTXNPtInLVAEK2sWn1Kzu5ZlJtCSDQkf4Fgl7boO24o+CT4pbOXGXGbXlBlsAAA",
  },
  {
    name: "Maria Luísa Cunha",
    phone: "+351 964 592 154",
    roles: ["CLUB_ADMIN", "PLAYER"],
  },
  {
    name: "Mário Albuquerque",
    phone: "+351 967 018 469",
    roles: ["CLUB_ADMIN", "PLAYER"],
  },
  {
    name: "Ana Cláudia Alves",
    phone: "+351 918 384 640",
    roles: ["PLAYER"],
    photo:
      "data:image/webp;base64,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",
  },
  {
    name: "João Meireles",
    phone: "+351 916 089 369",
    roles: ["PLAYER"],
    photo:
      "data:image/webp;base64,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",
  },
  {
    name: "Bernardo Santos",
    phone: "+351 918 765 725",
    roles: ["PLAYER"],
  },
  {
    name: "Fernanda Santos",
    phone: "+351 965 479 876",
    roles: ["PLAYER"],
  },
  {
    name: "Fred",
    phone: "+351 913 304 834",
    roles: ["PLAYER"],
  },
  {
    name: "Marta",
    phone: "+351 935 115 094",
    roles: ["PLAYER"],
  },
  {
    name: "Filipe Cardoso",
    phone: "+351 912 810 267",
    roles: ["PLAYER"],
  },
  {
    name: "Yuri Damasceno",
    phone: "+351 934 356 415",
    roles: ["PLAYER"],
  },
];

async function main() {
  console.log("Cleaning database...");
  await prisma.authMethod.deleteMany({});
  await prisma.profile.deleteMany({});
  await prisma.game.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.club.deleteMany({});
  console.log("  Done.");

  console.log("Seeding database...");

  let club = await prisma.club.create({
    data: { name: "CFBG" },
  });
  console.log(`  Created club: ${club.name} (${club.id})`);

  const passwordHash = await bcrypt.hash("password", 10);

  const sysAdmin = await prisma.user.create({
    data: {
      email: "admin@email.local",
      passwordHash,
      roles: ["SYSTEM_ADMIN"],
      authMethods: {
        create: {
          provider: "password",
          providerId: "admin@email.local",
        },
      },
      profile: {
        create: {
          name: "Admin",
        },
      },
    },
  });
  console.log(
    `  Created system admin: ${sysAdmin.email} (${sysAdmin.id}) [SYSTEM_ADMIN]`,
  );

  for (const m of members) {
    console.log(`  Creating ${m.roles.join("/")}: ${m.name}...`);

    const normalizedPhone = m.phone ? normalizePhone(m.phone) : undefined;

    const data: Record<string, unknown> = {
      passwordHash,
      roles: m.roles,
      clubId: club.id,
      authMethods: {
        create: {
          provider: "password",
          providerId: m.email ?? normalizedPhone ?? m.name,
        },
      },
      profile: {
        create: {
          name: m.name,
          ...(m.photo ? { photo: m.photo } : {}),
        },
      },
    };
    if (m.email) data.email = m.email;
    if (normalizedPhone) data.phone = normalizedPhone;

    await prisma.user.create({ data: data as any });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
