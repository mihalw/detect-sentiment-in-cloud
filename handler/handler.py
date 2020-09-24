import json
import os
import boto3
import uuid

s3client = boto3.client('s3')
s3 = boto3.resource('s3')
dynamodb = boto3.resource('dynamodb')
translate = boto3.client('translate')
comprehend = boto3.client('comprehend')

bucket = os.getenv("Bucket")
table = dynamodb.Table(os.getenv("Table"))

def list_messages(event, context):
    messages = table.scan()["Items"]
    return {
        "body": json.dumps(messages),
        "statusCode": 200
    }

def send_message(event, context):
    
    print(event['body'])
    uid = str(uuid.uuid4()) + ".txt"
    request_body = json.loads(event['body'])

    s3client.put_object(
        Bucket=bucket,
        Key=uid,
        Body=request_body["text"],
        ACL="public-read"
    )

    print("File {} saved as {}".format(request_body["filename"], uid))

    table.put_item(Item={
        "ID": uid,
        "FileName": request_body["filename"],
        "MessageStatus": "not yet verified",
        "Message": request_body["text"],
    })

    response = {
        "statusCode": 200,
        "body": "OK. Your message will be verified\n"
    }

    return response

def verify_message(event, context):

    print(event)
    
    for j in event["Records"]:
        records = json.loads(j["body"])
        for i in records["Records"]: 
            bucket = i["s3"]["bucket"]["name"]
            key = i["s3"]["object"]["key"]
            print(bucket, key)

    # read data from file stored on s3
    obj = s3.Object(bucket, key)
    body = obj.get()['Body'].read().decode('utf-8') 
    print(body)

    # detect language automatically and translate to English
    result_translate = translate.translate_text(Text=body, SourceLanguageCode="auto", TargetLanguageCode="en") 
    print(result_translate["SourceLanguageCode"])
    print(result_translate["TranslatedText"])

    # detect sentiment of message in English
    result_sentiment = comprehend.detect_sentiment(LanguageCode="en", Text=result_translate["TranslatedText"])
    print(result_sentiment)
    sentiment = result_sentiment["Sentiment"]
    print(sentiment)

    decision = ""
    if sentiment == "NEGATIVE":
        decision = "Rejected"
    elif sentiment == "POSITIVE" or sentiment == "NEUTRAL":
        decision = "Accepted"
    elif sentiment == "MIXED":
        decision = "Needed human verify"
    
    print("Decision=" +decision)
    table.update_item(
        Key={
            "ID": key
        },
        UpdateExpression="set #s = :r",
        ExpressionAttributeValues={
            ":r": decision,
        },
        ExpressionAttributeNames={
            "#s": "MessageStatus"
        }
    )
    return True
