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

    const bucket = new Bucket(this, "Bucket1", {});

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
    const resource_send = api.root.addResource("send");
    const resource_list = api.root.addResource("list");

    const f_send_message = new Function(this, "LambdaSendMessage", {
      code,
      handler: "handler.send_message",
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      environment,
    });
    resource_send.addMethod("POST", new LambdaIntegration(f_send_message), {
      authorizationType: AuthorizationType.NONE,
    });
    table.grantWriteData(f_send_message);
    bucket.grantWrite(f_send_message);

    const f_verify_message = new Function(this, "LambdaVerifyMessage", {
      code,
      handler: "handler.verify_message",
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      environment,
    });
    f_verify_message.addEventSource(new SqsEventSource(q, { batchSize: 1 }));
    table.grantReadWriteData(f_verify_message);
    f_verify_message.addToRolePolicy(
      new PolicyStatement({
        actions: ["translate:TranslateText", "comprehend:DetectDominantLanguage", "comprehend:DetectSentiment"],
        resources: ["*"],
      })
    );

    const f_list_messages = new Function(this, "LambdaListMessages", {
      code,
      handler: "handler.list_messages",
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      environment,
    });
    resource_list.addMethod("GET", new LambdaIntegration(f_list_messages), {
      authorizationType: AuthorizationType.NONE,
    });
    table.grantReadData(f_list_messages);
  }
}