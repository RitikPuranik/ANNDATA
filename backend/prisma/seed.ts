import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/modules/auth/auth.utils";

const prisma = new PrismaClient();

// Development-only demo credentials. Never a real production password, and
// this script is not wired into any production deploy step — run it
// explicitly with `npm run prisma:seed` when you want a demo account.
const DEMO_FARMER = {
  fullName: "Ramesh Patil",
  mobile: "9876543210",
  email: "ramesh.demo@farmlink.test",
  password: "DemoFarmer123!",
  preferredLanguage: "mr" as const,
};

// ---------------------------------------------------------------------------
// Module 2 reference data. Build spec section 7: "For the current SIH
// scope, prioritize Maharashtra, but design the database so other states
// can be added later." All 36 Maharashtra districts are seeded, each with a
// handful of representative talukas, so the cascading state → district →
// taluka UI never hits an empty taluka dropdown regardless of which
// district a user picks. This is not an exhaustive gazetteer (each
// district has far more talukas in reality) — just enough real names to
// exercise the UI end-to-end.
// ---------------------------------------------------------------------------

const MAHARASHTRA_DISTRICTS: Record<string, string[]> = {
  // Konkan division
  "Mumbai City": ["Mumbai City"],
  "Mumbai Suburban": ["Andheri", "Borivali", "Kurla"],
  Thane: ["Thane", "Kalyan", "Bhiwandi", "Ulhasnagar"],
  Palghar: ["Palghar", "Vasai", "Dahanu", "Jawhar"],
  Raigad: ["Alibag", "Panvel", "Pen", "Karjat"],
  Ratnagiri: ["Ratnagiri", "Chiplun", "Khed", "Dapoli"],
  Sindhudurg: ["Sawantwadi", "Kudal", "Malvan"],
  // Nashik division
  Nashik: ["Niphad", "Dindori", "Chandwad", "Nashik"],
  Dhule: ["Dhule", "Sakri", "Shirpur"],
  Nandurbar: ["Nandurbar", "Shahada", "Navapur"],
  Jalgaon: ["Jalgaon", "Bhusawal", "Chalisgaon", "Amalner"],
  Ahmednagar: ["Rahata", "Shrirampur", "Kopargaon"],
  // Pune division
  Pune: ["Haveli", "Baramati", "Junnar"],
  Satara: ["Satara", "Karad", "Phaltan", "Wai"],
  Sangli: ["Sangli", "Miraj", "Tasgaon", "Vita"],
  Solapur: ["Karmala", "Barshi", "Pandharpur"],
  Kolhapur: ["Panhala", "Hatkanangale"],
  // Chhatrapati Sambhajinagar division
  "Chhatrapati Sambhajinagar": ["Paithan", "Gangapur"],
  Jalna: ["Jalna", "Bhokardan", "Ambad"],
  Parbhani: ["Parbhani", "Gangakhed", "Jintur"],
  Hingoli: ["Hingoli", "Kalamnuri", "Sengaon"],
  Nanded: ["Nanded", "Deglur", "Kinwat"],
  Latur: ["Latur", "Udgir", "Ahmadpur"],
  Dharashiv: ["Dharashiv", "Tuljapur", "Omerga"],
  // Amravati division
  Amravati: ["Achalpur", "Chandur"],
  Akola: ["Akola", "Balapur", "Telhara"],
  Buldhana: ["Buldhana", "Chikhli", "Khamgaon"],
  Washim: ["Washim", "Karanja", "Risod"],
  Yavatmal: ["Yavatmal", "Pusad", "Darwha"],
  // Nagpur division
  Nagpur: ["Kamptee", "Hingna"],
  Wardha: ["Wardha", "Hinganghat", "Arvi"],
  Bhandara: ["Bhandara", "Tumsar", "Sakoli"],
  Gondia: ["Gondia", "Tirora", "Deori"],
  Chandrapur: ["Chandrapur", "Warora", "Ballarpur"],
  Gadchiroli: ["Gadchiroli", "Armori", "Desaiganj"],
};

// Build spec section 17: seed at least this list. Category is a free-text
// grouping label (not a controlled enum — see schema.prisma).
const CROPS: { name: string; category: string; hi: string; mr: string }[] = [
  { name: "Onion", category: "Vegetable", hi: "प्याज़", mr: "कांदा" },
  { name: "Cotton", category: "Fibre", hi: "कपास", mr: "कापूस" },
  { name: "Soybean", category: "Oilseed", hi: "सोयाबीन", mr: "सोयाबीन" },
  { name: "Wheat", category: "Cereal", hi: "गेहूं", mr: "गहू" },
  { name: "Tomato", category: "Vegetable", hi: "टमाटर", mr: "टोमॅटो" },
  { name: "Potato", category: "Vegetable", hi: "आलू", mr: "बटाटा" },
  { name: "Tur", category: "Pulse", hi: "तूर", mr: "तूर" },
  { name: "Rice", category: "Cereal", hi: "चावल", mr: "तांदूळ" },
  { name: "Maize", category: "Cereal", hi: "मक्का", mr: "मका" },
];

async function seedLocations() {
  const maharashtra = await prisma.state.upsert({
    where: { name: "Maharashtra" },
    update: {},
    create: { name: "Maharashtra" },
  });

  const districtIdByName: Record<string, string> = {};
  const talukaIdByName: Record<string, string> = {};

  for (const [districtName, talukaNames] of Object.entries(MAHARASHTRA_DISTRICTS)) {
    const district = await prisma.district.upsert({
      where: { stateId_name: { stateId: maharashtra.id, name: districtName } },
      update: {},
      create: { stateId: maharashtra.id, name: districtName },
    });
    districtIdByName[districtName] = district.id;

    for (const talukaName of talukaNames) {
      const taluka = await prisma.taluka.upsert({
        where: { districtId_name: { districtId: district.id, name: talukaName } },
        update: {},
        create: { districtId: district.id, name: talukaName },
      });
      talukaIdByName[`${districtName}:${talukaName}`] = taluka.id;
    }
  }

  console.log(`Seeded Maharashtra with ${Object.keys(districtIdByName).length} districts.`);
  return { maharashtraId: maharashtra.id, districtIdByName, talukaIdByName };
}

async function seedCrops() {
  const cropIdByName: Record<string, string> = {};

  for (const crop of CROPS) {
    const row = await prisma.crop.upsert({
      where: { name: crop.name },
      update: {},
      create: { name: crop.name, category: crop.category, active: true },
    });
    cropIdByName[crop.name] = row.id;

    for (const [language, localizedName] of [
      ["hi", crop.hi],
      ["mr", crop.mr],
    ] as const) {
      await prisma.cropTranslation.upsert({
        where: { cropId_language: { cropId: row.id, language } },
        update: { localizedName },
        create: { cropId: row.id, language, localizedName },
      });
    }
  }

  console.log(`Seeded ${CROPS.length} crops with Hindi/Marathi translations.`);
  return cropIdByName;
}

async function seedDemoFpo(context: { maharashtraId: string; nashikDistrictId: string; niphadTalukaId: string }) {
  const name = "Nashik Farmers Producer Organization";
  const existing = await prisma.fpo.findFirst({ where: { name, districtId: context.nashikDistrictId } });
  if (existing) return existing;

  // Module 3: a fuller registration than Module 2's original minimal stub —
  // see the Fpo model's own comment in schema.prisma. Seeded already
  // VERIFIED/ACTIVE so the demo showcases a working FPO end-to-end rather
  // than a still-pending registration.
  const fpo = await prisma.fpo.create({
    data: {
      name,
      legalName: `${name} Pvt. Ltd.`,
      organizationType: "FPO",
      stateId: context.maharashtraId,
      districtId: context.nashikDistrictId,
      talukaId: context.niphadTalukaId,
      village: "Niphad",
      phone: "9876500000",
      email: "contact@nashikfpo.demo.test",
      verificationStatus: "VERIFIED",
      accountStatus: "ACTIVE",
      active: true,
    },
  });
  console.log("Seeded demo FPO:", fpo.name);
  return fpo;
}

// Development-only demo credentials — same disclaimer as DEMO_FARMER above.
const DEMO_FPO_ADMIN = {
  fullName: "Sunita Deshmukh",
  mobile: "9876500000",
  email: "sunita.fpo@farmlink.test",
  password: "DemoFpoAdmin123!",
};

async function seedDemoFpoAdmin(fpoId: string) {
  let user = await prisma.user.findUnique({ where: { mobile: DEMO_FPO_ADMIN.mobile } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        fullName: DEMO_FPO_ADMIN.fullName,
        mobile: DEMO_FPO_ADMIN.mobile,
        email: DEMO_FPO_ADMIN.email,
        passwordHash: await hashPassword(DEMO_FPO_ADMIN.password),
        role: "FPO_ADMIN",
        accountStatus: "ACTIVE",
        preferredLanguage: "mr",
        phoneVerificationStatus: "VERIFIED",
        emailVerificationStatus: "PENDING",
        identityVerificationStatus: "PENDING",
      },
    });
  }

  const existingAdmin = await prisma.fpoAdmin.findUnique({ where: { fpoId_userId: { fpoId, userId: user.id } } });
  if (existingAdmin) return;

  await prisma.fpoAdmin.create({ data: { fpoId, userId: user.id, role: "PRIMARY_ADMIN", status: "ACTIVE" } });
  console.log("Seeded demo FPO admin:", user.mobile, `(password: ${DEMO_FPO_ADMIN.password}, development only)`);
}

// Fictional names only (build spec section 88: "Do not create
// realistic-looking real people's private data") — plain first/last name
// pools combined by index, not modeled on any real individual.
const FICTIONAL_FIRST_NAMES = [
  "Anil", "Sunil", "Vijay", "Prakash", "Manoj", "Suresh", "Ganesh", "Ravindra",
  "Ashok", "Dilip", "Sanjay", "Vinod", "Rajesh", "Mahesh", "Umesh", "Kiran",
  "Yogesh", "Nitin", "Santosh", "Bharat",
];
const FICTIONAL_LAST_NAMES = ["Jadhav", "Pawar", "Shinde", "Kale", "Bhosale", "Gaikwad", "More", "Deshmukh", "Chavan", "Sathe"];
const DEMO_VILLAGES = ["Niphad", "Pimpalgaon", "Ozar"];

/**
 * Build spec section 88/89: ~50 fictional farmers spread across Onion/
 * Soybean/Wheat, joined as ACTIVE members. Deliberately does NOT write any
 * pre-computed aggregate number anywhere (section 89: "the aggregation
 * service must calculate it") — each row here is just one farmer's own
 * crop data; GET /api/fpos/:fpoId/crop-aggregation sums it live.
 */
async function seedDemoFpoMembers(context: {
  fpoId: string;
  maharashtraId: string;
  nashikDistrictId: string;
  niphadTalukaId: string;
  onionCropId: string;
  soybeanCropId: string;
  wheatCropId: string;
}) {
  const alreadySeeded = await prisma.fpoMembership.count({ where: { fpoId: context.fpoId } });
  if (alreadySeeded >= 50) {
    console.log("Demo FPO already has its 50 fictional members — skipping.");
    return;
  }

  const crops = [
    { id: context.onionCropId, yieldUnit: "QTL/ACRE", yieldRange: [8, 14] as const },
    { id: context.soybeanCropId, yieldUnit: "QTL/ACRE", yieldRange: [6, 10] as const },
    { id: context.wheatCropId, yieldUnit: "QTL/ACRE", yieldRange: [10, 16] as const },
  ];

  const MEMBER_COUNT = 50;
  for (let i = 1; i <= MEMBER_COUNT; i++) {
    const mobile = `97${String(i).padStart(8, "0")}`;
    const fullName = `${FICTIONAL_FIRST_NAMES[i % FICTIONAL_FIRST_NAMES.length]} ${FICTIONAL_LAST_NAMES[i % FICTIONAL_LAST_NAMES.length]}`;

    let user = await prisma.user.findUnique({ where: { mobile } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          fullName,
          mobile,
          passwordHash: await hashPassword("DemoMember123!"),
          role: "FARMER",
          accountStatus: "ACTIVE",
          preferredLanguage: "mr",
          phoneVerificationStatus: "VERIFIED",
          emailVerificationStatus: "PENDING",
          identityVerificationStatus: "PENDING",
        },
      });
    }

    let profile = await prisma.farmerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.farmerProfile.create({
        data: {
          userId: user.id,
          liquidityPreference: "CAN_WAIT_2_WEEKS",
          willingToStore: i % 2 === 0,
          communicationPreference: "IN_APP",
        },
      });
    }

    const existingMembership = await prisma.fpoMembership.findFirst({
      where: { fpoId: context.fpoId, farmerId: profile.id },
    });
    if (existingMembership) continue;

    const area = 1 + (i % 6); // 1..6 acres, varied on purpose
    const farm = await prisma.farm.create({
      data: {
        farmerProfileId: profile.id,
        village: DEMO_VILLAGES[i % DEMO_VILLAGES.length],
        stateId: context.maharashtraId,
        districtId: context.nashikDistrictId,
        talukaId: context.niphadTalukaId,
        area,
        areaUnit: "ACRE",
        irrigationType: i % 2 === 0 ? "DRIP" : "CANAL",
      },
    });

    const crop = crops[i % crops.length];
    const [minYield, maxYield] = crop.yieldRange;
    const typicalYield = minYield + (i % (maxYield - minYield + 1));

    await prisma.farmerCrop.create({
      data: {
        farmerProfileId: profile.id,
        farmId: farm.id,
        cropId: crop.id,
        area,
        areaUnit: "ACRE",
        isPrimary: true,
        typicalYield,
        yieldUnit: crop.yieldUnit,
      },
    });

    const now = new Date();
    await prisma.fpoMembership.create({
      data: { fpoId: context.fpoId, farmerId: profile.id, status: "ACTIVE", requestedAt: now, approvedAt: now, joinedAt: now },
    });
  }

  console.log(`Seeded ${MEMBER_COUNT} fictional FPO members across Onion/Soybean/Wheat for the crop-aggregation demo.`);
}

// ---------------------------------------------------------------------------
// Buyer-matching demo data (Module: buyer-matching). Seeds a handful of
// already-VERIFIED buyers with ACTIVE demands across the crops the demo
// farmer/FPO members actually grow (Onion, Soybean, Wheat) plus a couple
// more (Cotton, Tomato, Potato) so a seller who lists a lot for any of
// those crops sees non-empty results from GET /api/lots/:id/matches,
// instead of an empty list on a freshly seeded database. Only VERIFIED
// buyers with ACTIVE, unexpired demands are ever matched — see
// BuyerMatchingService.matches().
// ---------------------------------------------------------------------------

const DEMO_BUYERS: Array<{
  fullName: string;
  mobile: string;
  email: string;
  organizationName: string;
  businessType: "PROCESSOR" | "WHOLESALER" | "RETAILER" | "EXPORTER" | "INSTITUTIONAL_BUYER" | "TRADER" | "OTHER";
  district: string;
  latitude: number;
  longitude: number;
  demands: Array<{
    cropName: string;
    title: string;
    requiredQuantity: number;
    minimumQuantity?: number;
    quantityUnit: "KG" | "QTL" | "TONNE";
    targetPrice?: number;
    minimumPrice?: number;
    maximumPrice?: number;
    grade?: "A" | "B" | "C" | "D";
  }>;
}> = [
  {
    fullName: "Anita Kulkarni",
    mobile: "9800000001",
    email: "anita.buyer@farmlink.test",
    organizationName: "Mahalaxmi Onion Processors",
    businessType: "PROCESSOR",
    district: "Nashik",
    latitude: 20.0113,
    longitude: 74.0862,
    demands: [
      {
        cropName: "Onion",
        title: "Grade A/B onions for dehydration unit",
        requiredQuantity: 500,
        minimumQuantity: 50,
        quantityUnit: "QTL",
        targetPrice: 1800,
        minimumPrice: 1500,
        maximumPrice: 2200,
        grade: "B",
      },
    ],
  },
  {
    fullName: "Rohan Deshpande",
    mobile: "9800000002",
    email: "rohan.buyer@farmlink.test",
    organizationName: "Godavari Agro Exports",
    businessType: "EXPORTER",
    district: "Nashik",
    latitude: 19.9975,
    longitude: 73.7898,
    demands: [
      {
        cropName: "Onion",
        title: "Export-grade onions, container loads",
        requiredQuantity: 1000,
        minimumQuantity: 200,
        quantityUnit: "QTL",
        targetPrice: 2100,
        minimumPrice: 1900,
        grade: "A",
      },
    ],
  },
  {
    fullName: "Meera Joshi",
    mobile: "9800000003",
    email: "meera.buyer@farmlink.test",
    organizationName: "Krishna Valley Soy Processing",
    businessType: "PROCESSOR",
    district: "Pune",
    latitude: 18.5204,
    longitude: 73.8567,
    demands: [
      {
        cropName: "Soybean",
        title: "Soybean for oil extraction",
        requiredQuantity: 300,
        minimumQuantity: 25,
        quantityUnit: "QTL",
        targetPrice: 4200,
        minimumPrice: 3800,
      },
    ],
  },
  {
    fullName: "Suresh Pawar",
    mobile: "9800000004",
    email: "suresh.buyer@farmlink.test",
    organizationName: "Deccan Wholesale Grain Traders",
    businessType: "WHOLESALER",
    district: "Ahmednagar",
    latitude: 19.0948,
    longitude: 74.748,
    demands: [
      {
        cropName: "Wheat",
        title: "Bulk wheat for regional mandis",
        requiredQuantity: 800,
        minimumQuantity: 100,
        quantityUnit: "QTL",
        targetPrice: 2400,
      },
    ],
  },
  {
    fullName: "Farida Shaikh",
    mobile: "9800000005",
    email: "farida.buyer@farmlink.test",
    organizationName: "Vidarbha Cotton Mills",
    businessType: "PROCESSOR",
    district: "Nagpur",
    latitude: 21.1458,
    longitude: 79.0882,
    demands: [
      {
        cropName: "Cotton",
        title: "Raw cotton for ginning unit",
        requiredQuantity: 400,
        minimumQuantity: 40,
        quantityUnit: "QTL",
        targetPrice: 6500,
        grade: "B",
      },
    ],
  },
  {
    fullName: "Deepak Nair",
    mobile: "9800000006",
    email: "deepak.buyer@farmlink.test",
    organizationName: "FreshMart Retail Supply Co.",
    businessType: "RETAILER",
    district: "Kolhapur",
    latitude: 16.705,
    longitude: 74.2433,
    demands: [
      {
        cropName: "Tomato",
        title: "Fresh tomatoes for retail chain",
        requiredQuantity: 150,
        minimumQuantity: 10,
        quantityUnit: "QTL",
        targetPrice: 1200,
      },
      {
        cropName: "Potato",
        title: "Potatoes for retail chain",
        requiredQuantity: 200,
        minimumQuantity: 20,
        quantityUnit: "QTL",
        targetPrice: 1400,
      },
    ],
  },
];

async function seedDemoBuyers(cropIdByName: Record<string, string>) {
  let demandCount = 0;

  for (const b of DEMO_BUYERS) {
    let user = await prisma.user.findUnique({ where: { mobile: b.mobile } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          fullName: b.fullName,
          mobile: b.mobile,
          email: b.email,
          passwordHash: await hashPassword("DemoBuyer123!"),
          role: "BUYER",
          accountStatus: "ACTIVE",
          preferredLanguage: "mr",
          phoneVerificationStatus: "VERIFIED",
          emailVerificationStatus: "PENDING",
          identityVerificationStatus: "PENDING",
        },
      });
    }

    let profile = await prisma.buyerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.buyerProfile.create({
        data: {
          userId: user.id,
          organizationName: b.organizationName,
          businessType: b.businessType,
          contactPerson: b.fullName,
          phone: b.mobile,
          email: b.email,
          state: "Maharashtra",
          district: b.district,
          latitude: b.latitude,
          longitude: b.longitude,
          // Seeded as already VERIFIED — matches() only ever surfaces
          // demands from verified buyers (build spec: unverified buyers
          // must not appear to farmers), so a PENDING demo buyer would be
          // invisible and defeat the point of this seed data.
          verificationStatus: "VERIFIED",
        },
      });
    }

    for (const d of b.demands) {
      const cropId = cropIdByName[d.cropName];
      if (!cropId) continue;

      const existing = await prisma.buyerDemand.findFirst({ where: { buyerId: profile.id, title: d.title } });
      if (existing) continue;

      await prisma.buyerDemand.create({
        data: {
          buyerId: profile.id,
          cropId,
          title: d.title,
          requiredQuantity: d.requiredQuantity,
          minimumQuantity: d.minimumQuantity ?? null,
          quantityUnit: d.quantityUnit,
          targetPrice: d.targetPrice ?? null,
          minimumPrice: d.minimumPrice ?? null,
          maximumPrice: d.maximumPrice ?? null,
          grade: d.grade ?? null,
          state: "Maharashtra",
          district: b.district,
          latitude: b.latitude,
          longitude: b.longitude,
          status: "ACTIVE",
        },
      });
      demandCount += 1;
    }
  }

  console.log(`Seeded ${DEMO_BUYERS.length} verified demo buyers with ${demandCount} active demands.`);
}

async function seedDemoFarmer(context: {
  nashikDistrictId: string;
  niphadTalukaId: string;
  maharashtraId: string;
  demoFpoId: string;
  onionCropId: string;
  soybeanCropId: string;
}) {
  const existingUser = await prisma.user.findUnique({ where: { mobile: DEMO_FARMER.mobile } });
  if (existingUser) {
    const existingProfile = await prisma.farmerProfile.findUnique({ where: { userId: existingUser.id } });
    if (existingProfile) {
      console.log("Demo farmer + farmer profile already exist — skipping Module 2 demo data.");
      return;
    }
  }

  // Build spec section 61: fictional demo data only — never real farmer PII.
  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        fullName: DEMO_FARMER.fullName,
        mobile: DEMO_FARMER.mobile,
        email: DEMO_FARMER.email,
        passwordHash: await hashPassword(DEMO_FARMER.password),
        role: "FARMER",
        accountStatus: "ACTIVE",
        preferredLanguage: DEMO_FARMER.preferredLanguage,
        phoneVerificationStatus: "VERIFIED",
        emailVerificationStatus: "PENDING",
        identityVerificationStatus: "PENDING",
      },
    }));

  const profile = await prisma.farmerProfile.create({
    data: {
      userId: user.id,
      fpoMembershipStatus: "MEMBER",
      fpoId: context.demoFpoId,
      liquidityPreference: "CAN_WAIT_2_WEEKS",
      willingToStore: true,
      communicationPreference: "IN_APP",
    },
  });

  const farm = await prisma.farm.create({
    data: {
      farmerProfileId: profile.id,
      name: "Main Farm",
      village: "Pimpalgaon",
      pincode: "422209",
      stateId: context.maharashtraId,
      districtId: context.nashikDistrictId,
      talukaId: context.niphadTalukaId,
      area: 4.5,
      areaUnit: "ACRE",
      irrigationType: "DRIP",
    },
  });

  await prisma.farmerCrop.create({
    data: {
      farmerProfileId: profile.id,
      farmId: farm.id,
      cropId: context.onionCropId,
      area: 3,
      areaUnit: "ACRE",
      isPrimary: true,
    },
  });
  await prisma.farmerCrop.create({
    data: {
      farmerProfileId: profile.id,
      farmId: farm.id,
      cropId: context.soybeanCropId,
      area: 1.5,
      areaUnit: "ACRE",
      isPrimary: false,
    },
  });

  console.log("Seeded demo farmer profile + farm + crops:", {
    mobile: user.mobile,
    farm: `${farm.village}, ${MAHARASHTRA_DISTRICTS.Nashik ? "Nashik" : ""}, Maharashtra`,
    note: `Demo login password: ${DEMO_FARMER.password} (development only)`,
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.log("Refusing to seed demo data in a production environment.");
    return;
  }

  const { maharashtraId, districtIdByName, talukaIdByName } = await seedLocations();
  const cropIdByName = await seedCrops();
  await seedDemoBuyers(cropIdByName);
  const demoFpo = await seedDemoFpo({
    maharashtraId,
    nashikDistrictId: districtIdByName.Nashik,
    niphadTalukaId: talukaIdByName["Nashik:Niphad"],
  });
  await seedDemoFpoAdmin(demoFpo.id);

  await seedDemoFarmer({
    nashikDistrictId: districtIdByName.Nashik,
    niphadTalukaId: talukaIdByName["Nashik:Niphad"],
    maharashtraId,
    demoFpoId: demoFpo.id,
    onionCropId: cropIdByName.Onion,
    soybeanCropId: cropIdByName.Soybean,
  });

  await seedDemoFpoMembers({
    fpoId: demoFpo.id,
    maharashtraId,
    nashikDistrictId: districtIdByName.Nashik,
    niphadTalukaId: talukaIdByName["Nashik:Niphad"],
    onionCropId: cropIdByName.Onion,
    soybeanCropId: cropIdByName.Soybean,
    wheatCropId: cropIdByName.Wheat,
  });
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });