import { prisma } from "@/lib/db";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo User",
      emailVerified: true,
    },
  });

  await prisma.post.createMany({
    data: [
      { title: "Welcome to the template", published: true, authorId: user.id },
      { title: "Draft post", published: false, authorId: user.id },
    ],
    skipDuplicates: true,
  });

  console.log(`Seeded user ${user.email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
