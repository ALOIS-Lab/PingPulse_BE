/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultWebsites = [
  { website_name: 'Alois Solutions', website_url: 'https://aloissolutions.com' },
  { website_name: 'Alois Solutions AU', website_url: 'https://aloissolutions.com.au' },
  { website_name: 'Alois Healthcare', website_url: 'https://aloishealthcare.com' },
  { website_name: 'Adriva Services', website_url: 'https://adrivaservices.com' },
  { website_name: 'Alois Composites', website_url: 'https://aloiscomposites.com' },
  { website_name: 'Alois Exports', website_url: 'https://aloisexports.com' },
  { website_name: 'Akino Labs', website_url: 'https://akinolabs.com' },
  { website_name: 'Akino Labs IO', website_url: 'https://akinolabs.io' },
  { website_name: 'Avera Finance', website_url: 'https://averafinance.com' },
];

async function main() {
  console.log(`Start seeding...`);
  for (const site of defaultWebsites) {
    const website = await prisma.website.create({
      data: {
        website_name: site.website_name,
        website_url: site.website_url,
        expected_status_code: 200,
        monitoring_enabled: true,
      },
    });
    console.log(`Created website with id: ${website.id}`);
  }
  console.log(`Seeding finished.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });