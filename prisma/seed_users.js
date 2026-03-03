require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- SEEDING USERS ---');

    const ownerEmail = 'subhrajyotisahoo08@gmail.com';
    const teacherEmail = 'itssubhra222@gmail.com';
    const studentEmail = 'jsubhra502@gmail.com';
    const coachingName = 'Subhra Coaching Center';

    const owner = await prisma.user.upsert({
        where: { email: ownerEmail },
        update: {
            firstName: 'Subhra',
            lastName: 'Owner',
            isActive: true,
        },
        create: {
            email: ownerEmail,
            firstName: 'Subhra',
            lastName: 'Owner',
            password: '',
            isActive: true,
        },
    });
    console.log(`Owner created/found: ${owner.id}`);

    const ownerCentres = await prisma.coachingCentre.findMany({
        where: { ownerId: owner.id },
        orderBy: { createdAt: 'asc' },
    });

    let coaching;
    if (ownerCentres.length === 0) {
        coaching = await prisma.coachingCentre.create({
            data: {
                name: coachingName,
                description: 'Main coaching center for all subjects',
                ownerId: owner.id,
            },
        });
        console.log(`Coaching center created: ${coaching.id}`);
    } else {
        coaching = ownerCentres[0];
        await prisma.coachingCentre.update({
            where: { id: coaching.id },
            data: {
                name: coachingName,
                description: 'Main coaching center for all subjects',
                isActive: true,
            },
        });

        if (ownerCentres.length > 1) {
            const extraIds = ownerCentres.slice(1).map((centre) => centre.id);
            console.warn(`Warning: Owner has extra coaching centres: ${extraIds.join(', ')}`);
            console.warn('Only the first coaching centre is used by this seed script.');
        }

        console.log(`Coaching center reused: ${coaching.id}`);
    }

    await prisma.coachingUser.upsert({
        where: {
            userId_coachingId: {
                userId: owner.id,
                coachingId: coaching.id,
            },
        },
        update: {
            role: 'OWNER',
            assignedBy: owner.id,
        },
        create: {
            userId: owner.id,
            coachingId: coaching.id,
            role: 'OWNER',
            assignedBy: owner.id,
        },
    });
    console.log('Owner linked to coaching center.');

    const teacher = await prisma.user.upsert({
        where: { email: teacherEmail },
        update: {
            firstName: 'Subhra',
            lastName: 'Teacher (Math)',
            isActive: true,
        },
        create: {
            email: teacherEmail,
            firstName: 'Subhra',
            lastName: 'Teacher (Math)',
            password: '',
            isActive: true,
        },
    });

    await prisma.coachingUser.upsert({
        where: {
            userId_coachingId: {
                userId: teacher.id,
                coachingId: coaching.id,
            },
        },
        update: {
            role: 'TEACHER',
            assignedBy: owner.id,
        },
        create: {
            userId: teacher.id,
            coachingId: coaching.id,
            role: 'TEACHER',
            assignedBy: owner.id,
        },
    });
    console.log(`Teacher added/updated: ${teacherEmail}`);

    const studentUser = await prisma.user.upsert({
        where: { email: studentEmail },
        update: {
            firstName: 'Subhra',
            lastName: 'Student',
            isActive: true,
        },
        create: {
            email: studentEmail,
            firstName: 'Subhra',
            lastName: 'Student',
            password: '',
            isActive: true,
        },
    });

    await prisma.coachingUser.upsert({
        where: {
            userId_coachingId: {
                userId: studentUser.id,
                coachingId: coaching.id,
            },
        },
        update: {
            role: 'STUDENT',
            assignedBy: owner.id,
        },
        create: {
            userId: studentUser.id,
            coachingId: coaching.id,
            role: 'STUDENT',
            assignedBy: owner.id,
        },
    });

    await prisma.studentProfile.upsert({
        where: {
            userId_coachingId: {
                userId: studentUser.id,
                coachingId: coaching.id,
            },
        },
        update: {
            gradeLevel: 'Grade 10',
        },
        create: {
            userId: studentUser.id,
            coachingId: coaching.id,
            gradeLevel: 'Grade 10',
        },
    });
    console.log(`Student added/updated: ${studentEmail}`);

    console.log('--- SEEDING COMPLETED ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
