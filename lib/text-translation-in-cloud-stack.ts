import * as cdk from '@aws-cdk/core';
import { Table, AttributeType, BillingMode } from "@aws-cdk/aws-dynamodb";
import { Bucket } from "@aws-cdk/aws-s3";
import { Queue } from "@aws-cdk/aws-sqs";
import { Duration } from "@aws-cdk/core";
import { SqsDestination } from "@aws-cdk/aws-s3-notifications";
import { Function, Code, Runtime } from "@aws-cdk/aws-lambda";
import {
  RestApi,
  LambdaIntegration,
  AuthorizationType,
} from "@aws-cdk/aws-apigateway";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { PolicyStatement } from "@aws-cdk/aws-iam";
export class TextTranslationInCloudStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new Table(this, "Table", {
      partitionKey: {
        name: "ID",
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const bucket = new Bucket(this, "Bucket", {});

    const q = new Queue(this, "Queue", {
      visibilityTimeout: Duration.minutes(5),
    });
    bucket.addObjectCreatedNotification(new SqsDestination(q));

    const code = Code.fromAsset("handler/");
    const environment = {
      Bucket: bucket.bucketName,
      Table: table.tableName,
    };
    const api = new RestApi(this, "Api");
    const resource_upload = api.root.addResource("upload");
    const resource_list = api.root.addResource("list");

    const f_upload = new Function(this, "LambdaUpload", {
      code,
      handler: "handler.upload",
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      environment,
    });
    resource_upload.addMethod("POST", new LambdaIntegration(f_upload), {
      authorizationType: AuthorizationType.NONE,
    });
    table.grantWriteData(f_upload);
    bucket.grantWrite(f_upload);

    const f_list = new Function(this, "LambdaList", {
      code,
      handler: "handler.list",
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      environment,
    });
    resource_list.addMethod("GET", new LambdaIntegration(f_list), {
      authorizationType: AuthorizationType.NONE,
    });
    table.grantReadData(f_list);

    const f_created = new Function(this, "LambdaCreated", {
      code,
      handler: "handler.created",
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      environment,
    });
    f_created.addEventSource(new SqsEventSource(q, { batchSize: 1 }));
    table.grantReadWriteData(f_created);
    f_created.addToRolePolicy(
      new PolicyStatement({
        actions: ["rekognition:DetectLabels"],
        resources: ["*"],
      })
    );
  }
}