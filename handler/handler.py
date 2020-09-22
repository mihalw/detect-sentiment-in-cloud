import json
import os
import boto3
import uuid
import pprint
import base64

s3client = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
rekog = boto3.client('rekognition')

bucket = os.getenv("Bucket")
table = dynamodb.Table(os.getenv("Table"))

def get_public_url(bucket, key):
    return "https://s3.us-east-1.amazonaws.com/{}/{}".format(bucket, key)

def list(event, context):
    items = table.scan()["Items"]
    return {
        "body": json.dumps(items),
        "statusCode": 200
    }


def upload(event, context):
    uid = str(uuid.uuid4()) + ".png"
    
    print(event['body'])
    request_body = json.loads(event['body'])

    s3client.put_object(
        Bucket=bucket,
        Key=uid,
        Body=base64.b64decode(request_body["file"]),
        ACL="public-read"
    )

    print("File {} saved as {}".format(request_body["name"], uid))

    table.put_item(Item={
        "ID": uid,
        "FileName": request_body["name"],
        "Result": False,
        "URL": get_public_url(bucket, uid)
    })

    body = {
        "url": get_public_url(bucket, uid)
    }
    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response

def created(event, context):
    print(event)
    def check_hotdog(records):
        for i in records:
            if i["Name"] == "Hot Dog":
                return True
        return False
    
    for j in event["Records"]:
        records = json.loads(j["body"])
        for i in records["Records"]: # co tu nie tak ? ;/
            bucket = i["s3"]["bucket"]["name"]
            key = i["s3"]["object"]["key"]
            print(bucket, key)

            response = rekog.detect_labels(
                Image={
                    "S3Object": {
                        "Bucket": bucket,
                        "Name": key
                    }
                },
                MaxLabels=10,
                MinConfidence=90
            )
            result = check_hotdog(response["Labels"])

            # table.put_item(Item={
            #     "ID": key.split(".")[0],
            #     "Result": True,
            #     "HotDog": result
            # })
            table.update_item(
                Key={
                    "ID": key
                },
                UpdateExpression="set #s = :r, HotDog = :h",
                ExpressionAttributeValues={
                    ":r": True,
                    ":h": result
                },
                ExpressionAttributeNames={
                    "#s": "Result"
                }
            )
    return True
