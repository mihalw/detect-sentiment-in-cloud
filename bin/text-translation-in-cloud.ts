#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { TextTranslationInCloudStack } from '../lib/text-translation-in-cloud-stack';

const app = new cdk.App();
new TextTranslationInCloudStack(app, 'TextTranslationInCloudStack');
