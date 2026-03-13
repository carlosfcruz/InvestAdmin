import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const clientProps = {
    region: 'localhost',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'MockAccessKeyId', secretAccessKey: 'MockSecretAccessKey' },
};

const client = new DynamoDBClient(clientProps);

const createUsersTable = async () => {
    const command = new CreateTableCommand({
        TableName: 'Users',
        KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
            { AttributeName: 'userId', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
    });
    console.log('Creating Users table...');
    try {
        const response = await client.send(command);
        console.log('Users table created.');
    } catch (err: any) {
        if (err.name === 'ResourceInUseException') {
            console.log('Users table already exists.');
        } else {
            console.error('Error creating Users table', err);
        }
    }
};

const createInvestmentsTable = async () => {
    const command = new CreateTableCommand({
        TableName: 'Investments',
        KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
            { AttributeName: 'investmentId', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
            { AttributeName: 'userId', AttributeType: 'S' },
            { AttributeName: 'investmentId', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
    });
    console.log('Creating Investments table...');
    try {
        const response = await client.send(command);
        console.log('Investments table created.');
    } catch (err: any) {
        if (err.name === 'ResourceInUseException') {
            console.log('Investments table already exists.');
        } else {
            console.error('Error creating Investments table', err);
        }
    }
};

const createEconomicIndexesTable = async () => {
    const command = new CreateTableCommand({
        TableName: 'EconomicIndexes',
        KeySchema: [
            { AttributeName: 'indexType', KeyType: 'HASH' },
            { AttributeName: 'date', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
            { AttributeName: 'indexType', AttributeType: 'S' },
            { AttributeName: 'date', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
    });
    console.log('Creating EconomicIndexes table...');
    try {
        const response = await client.send(command);
        console.log('EconomicIndexes table created.');
    } catch (err: any) {
        if (err.name === 'ResourceInUseException') {
            console.log('EconomicIndexes table already exists.');
        } else {
            console.error('Error creating EconomicIndexes table', err);
        }
    }
};

const createFundQuotesTable = async () => {
    const command = new CreateTableCommand({
        TableName: 'FundQuotes',
        KeySchema: [
            { AttributeName: 'cnpj', KeyType: 'HASH' },
            { AttributeName: 'date', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
            { AttributeName: 'cnpj', AttributeType: 'S' },
            { AttributeName: 'date', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
    });
    console.log('Creating FundQuotes table...');
    try {
        const response = await client.send(command);
        console.log('FundQuotes table created.');
    } catch (err: any) {
        if (err.name === 'ResourceInUseException') {
            console.log('FundQuotes table already exists.');
        } else {
            console.error('Error creating FundQuotes table', err);
        }
    }
};

const run = async () => {
    await createUsersTable();
    await createInvestmentsTable();
    await createEconomicIndexesTable();
    await createFundQuotesTable();
    console.log('Database initialization done.');
};

run();
